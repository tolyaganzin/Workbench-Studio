const editor =
  document.getElementById('editor');

const previewVideo =
  document.getElementById('previewVideo');

const livePlaceholder =
  document.getElementById('livePlaceholder');

const startStreamBtn =
  document.getElementById('startStreamBtn');

const stopLiveBtn =
  document.getElementById('stopLiveBtn');

const liveStatus =
  document.getElementById('liveStatus');

const cameraList =
  document.getElementById('cameraList');

const micList =
  document.getElementById('micList');

const layersPanel =
  document.getElementById('layersPanel');

const sceneInfo =
  document.getElementById('sceneInfo');

const workbenchView =
  document.getElementById('workbenchView');

const liveView =
  document.getElementById('liveView');

const workbench =
  document.getElementById('workbench');

const workbenchWrapper =
  document.querySelector('.workbench-wrapper');

const livePreviewWrapper =
  document.querySelector('.live-preview-wrapper');

const hiddenStreamCanvas =
  document.createElement('canvas');

const hiddenStreamCtx =
  hiddenStreamCanvas.getContext('2d');

// keep the canvas offscreen but renderable (avoid display:none which may pause drawing)
hiddenStreamCanvas.style.position = 'absolute';
hiddenStreamCanvas.style.left = '-9999px';
hiddenStreamCanvas.style.top = '0';
hiddenStreamCanvas.style.width = '1px';
hiddenStreamCanvas.style.height = '1px';
hiddenStreamCanvas.style.opacity = '0';
hiddenStreamCanvas.style.pointerEvents = 'none';
document.body.appendChild(hiddenStreamCanvas);

let hiddenStream =
  hiddenStreamCanvas.captureStream
    ? hiddenStreamCanvas.captureStream(60)
    : null;

const workbenchWidthInput =
  document.getElementById('workbenchWidth');

const workbenchHeightInput =
  document.getElementById('workbenchHeight');

const workbenchSizeSelect =
  document.getElementById('workbenchSizeSelect');

const PRESETS = {
  hd: { w: 1280, h: 720 },
  fullhd: { w: 1920, h: 1080 },
  qhd: { w: 2560, h: 1440 },
  uhd: { w: 3840, h: 2160 },
};

const audioContext =
  new AudioContext();

const audioDestination =
  audioContext.createMediaStreamDestination();

let scene = [];

let zCounter = 1;

let finalStream = null;
let liveRecorder = null;
let liveSendInterval = null;
let liveRequestInterval = null;
let liveCountdownInterval = null;
let liveCountdownType = null;
let pendingChunks = [];
let isStoppingLive = false;
let isStopCountdown = false;
let isLiveActive = false;
let liveSentChunkCount = 0;
let lastRenderTime = 0;
let frameDrawCount = 0;
let zeroBlobCount = 0;

function testVideoRecorder() {
  // diagnostic: try recording canvas-only stream to see if encoder emits bytes
  try {
    if (!hiddenStreamCanvas || typeof hiddenStreamCanvas.captureStream !== 'function') return;
    const testStream = hiddenStreamCanvas.captureStream(30);
    const testTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    let sel = '';
    for (const t of testTypes) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
        sel = t;
        break;
      }
    }

    const tr = sel ? new MediaRecorder(testStream, { mimeType: sel }) : new MediaRecorder(testStream);
    tr.ondataavailable = (ev) => {
      console.log('[Workbench][diag] testVideoRecorder data', ev.data && ev.data.size, ev.data && ev.data.type);
      try { tr.stop(); } catch (e) {}
    };
    tr.onerror = (e) => console.warn('[Workbench][diag] testVideoRecorder error', e);
    tr.start(1000);
    setTimeout(() => {
      try { if (tr.state !== 'inactive') tr.stop(); } catch (e) {}
    }, 1500);
  } catch (e) {
    console.warn('testVideoRecorder failed', e);
  }
}

function setLiveStatus(text) {
  if (liveStatus) {
    liveStatus.textContent = text;
  }
}

function clearLiveStatus() {
  if (liveStatus) {
    liveStatus.textContent = '';
  }
}

function clearLiveCountdown() {
  if (liveCountdownInterval) {
    clearInterval(liveCountdownInterval);
    liveCountdownInterval = null;
    liveCountdownType = null;
  }
}

function runCountdown(label, onComplete) {
  let count = 2;
  liveCountdownType = label;

  setLiveStatus(`${label} in ${count}...`);

  if (liveCountdownInterval) {
    clearInterval(liveCountdownInterval);
  }

  liveCountdownInterval = setInterval(() => {
    count -= 1;

    if (count >= 0) {
      if (count === 0) {
        setLiveStatus(`${label}...`);
      } else {
        setLiveStatus(`${label} in ${count}...`);
      }
    }

    if (count < 0) {
      clearLiveCountdown();
      onComplete?.();
    }
  }, 1000);
}

function ensureLiveSendInterval() {
  if (liveSendInterval) return;

  liveSendInterval = setInterval(() => {
    sendPendingChunk();
  }, 2000);
}

function stopLiveRequestInterval() {
  if (liveRequestInterval) {
    clearInterval(liveRequestInterval);
    liveRequestInterval = null;
  }
}

function stopLiveSendInterval() {
  if (liveSendInterval) {
    clearInterval(liveSendInterval);
    liveSendInterval = null;
  }
}

function finalizeLiveStop() {
  if (liveRecorder) return;

  if (pendingChunks.length) {
    ensureLiveSendInterval();
    return;
  }

  stopLiveSendInterval();
  stopLiveRequestInterval();
  setLiveStatus('Live stopped — last bytes sent');
  startStreamBtn.style.display = 'block';
  stopLiveBtn.style.display = 'none';
  startStreamBtn.disabled = false;
  stopLiveBtn.disabled = true;
  isStoppingLive = false;
  isLiveActive = false;
  log('LIVE FULLY STOPPED');
}

function sendPendingChunk() {
  if (!pendingChunks.length) {
    if (isStoppingLive && !liveRecorder) {
      finalizeLiveStop();
    }
    return;
  }

  const chunk = pendingChunks.shift();
  liveSentChunkCount += 1;

  console.log(
    `[Workbench] Sending live chunk #${liveSentChunkCount}`,
    {
      size: chunk.size,
      type: chunk.type,
      sequence: liveSentChunkCount,
      pending: pendingChunks.length,
      timestamp: new Date().toISOString(),
    }
  );

  // TODO: send chunk to backend here

  if (isStoppingLive && !pendingChunks.length && !liveRecorder) {
    finalizeLiveStop();
  }
}

// --------------------------------------------------
// GLOBAL TABS
// --------------------------------------------------

document
  .querySelectorAll('.global-tab')
  .forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll('.global-tab')
        .forEach((b) =>
          b.classList.remove('active')
        );

      btn.classList.add('active');

      const tab = btn.dataset.tab;

      document
        .querySelectorAll('.tab-content')
        .forEach((t) =>
          t.classList.remove('active')
        );

      if (tab === 'create') {
        document
          .getElementById('createTab')
          .classList.add('active');

        workbenchView.classList.add(
          'active'
        );

        liveView.classList.remove(
          'active'
        );
      }

      if (tab === 'live') {
        document
          .getElementById('liveTab')
          .classList.add('active');

        liveView.classList.add(
          'active'
        );

        workbenchView.classList.remove(
          'active'
        );
      }
    };
  });

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function log(...args) {
  console.log('[Workbench]', ...args);
}

let workbenchWidth = 1280;
let workbenchHeight = 720;

function updateSceneInfo() {
  sceneInfo.textContent =
    `Layers: ${scene.length}`;
}

// -------------------------
// SCALE / FIT HELPERS
// -------------------------

const workbenchContent =
  document.querySelector('.workbench-content');

const liveContent =
  document.querySelector('.live-content');

const workbenchScaleInput =
  document.getElementById('workbenchScale');

const workbenchScaleValue =
  document.getElementById('workbenchScaleValue');

const SCALE_MIN = 0.25;
const SCALE_MAX = 1.5;
let workbenchScale = 1;

function updateSizeLabels() {
  const text = `${workbenchWidth}×${workbenchHeight}`;
  const wh = document.getElementById('workbenchHeaderSize');
  const lh = document.getElementById('liveHeaderSize');
  if (wh) wh.textContent = text;
  if (lh) lh.textContent = text;
}

function updateScale(value, updateInput = true) {
  const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));

  workbenchScale = next;

  if (workbenchScaleInput && updateInput) {
    workbenchScaleInput.value = next;
  }

  if (workbenchScaleValue) {
    workbenchScaleValue.textContent = `${Math.round(next * 100)}%`;
  }

  if (workbenchContent) {
    workbenchContent.style.transform = `scale(${next})`;
    workbenchContent.style.transformOrigin = 'center top';
  } else if (workbench) {
    workbench.style.transform = `scale(${next})`;
  }

  if (liveContent) {
    liveContent.style.transform = `scale(${next})`;
    liveContent.style.transformOrigin = 'center top';
  }
}

function autoScaleToFit() {
  const container = document.querySelector('.main');
  if (!container) return;

  const bounds = container.getBoundingClientRect();
  const style = window.getComputedStyle(container);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padRight = parseFloat(style.paddingRight) || 0;
  const padTop = parseFloat(style.paddingTop) || 0;
  const padBottom = parseFloat(style.paddingBottom) || 0;

  // active header sits above the view content
  const activeHeader = container.querySelector('.view.active .workbench-header');
  const headerH = activeHeader ? activeHeader.getBoundingClientRect().height : 0;

  const availableW = Math.max(10, bounds.width - padLeft - padRight);
  const availableH = Math.max(10, bounds.height - padTop - padBottom - headerH);

  const fitScale = Math.min(
    1,
    Math.max(
      SCALE_MIN,
      Math.min(availableW / workbenchWidth, availableH / workbenchHeight)
    )
  );

  updateScale(fitScale);
}

window.addEventListener('resize', () => autoScaleToFit());


function updateWorkbenchSize(
  width,
  height
) {
  const prevW = workbenchWidth;
  const prevH = workbenchHeight;

  const newW = Math.max(100, width);
  const newH = Math.max(100, height);

  const scaleX = prevW > 0 ? newW / prevW : 1;
  const scaleY = prevH > 0 ? newH / prevH : 1;

  // Scale all scene items so they remain on-screen and proportionally positioned
  scene.forEach((item) => {
    item.x = Math.round(item.x * scaleX);
    item.y = Math.round(item.y * scaleY);
    item.width = Math.max(10, Math.round(item.width * scaleX));
    item.height = Math.max(10, Math.round(item.height * scaleY));
    if (item.tile) updateTile(item);
  });

  workbenchWidth = newW;
  workbenchHeight = newH;

  workbenchWrapper.style.width =
    workbenchWidth + 'px';
  workbenchWrapper.style.height =
    workbenchHeight + 'px';

  workbench.style.width =
    workbenchWidth + 'px';
  workbench.style.height =
    workbenchHeight + 'px';

  hiddenStreamCanvas.width = workbenchWidth;
  hiddenStreamCanvas.height = workbenchHeight;

  editor.style.width =
    workbenchWidth + 'px';
  editor.style.height =
    workbenchHeight + 'px';

  livePreviewWrapper.style.width =
    workbenchWidth + 'px';
  livePreviewWrapper.style.height =
    workbenchHeight + 'px';

  // Keep preset select in sync with current size
  try {
    if (workbenchSizeSelect) {
      let matched = false;
      for (const key in PRESETS) {
        const p = PRESETS[key];
        if (p.w === workbenchWidth && p.h === workbenchHeight) {
          workbenchSizeSelect.value = key;
          matched = true;
          break;
        }
      }
      if (!matched) workbenchSizeSelect.value = 'custom';
    }
  } catch (e) {
    /* ignore if select not present */
  }
}

workbenchWidthInput.onchange = () => {
  updateWorkbenchSize(
    Number(workbenchWidthInput.value),
    workbenchHeight
  );
};

workbenchHeightInput.onchange = () => {
  updateWorkbenchSize(
    workbenchWidth,
    Number(workbenchHeightInput.value)
  );
};

updateWorkbenchSize(
  workbenchWidth,
  workbenchHeight
);

// Wire preset select -> inputs
if (workbenchSizeSelect) {
  workbenchSizeSelect.onchange = () => {
    const v = workbenchSizeSelect.value;
    if (v === 'custom') return;
    const p = PRESETS[v];
    if (p) {
      workbenchWidthInput.value = p.w;
      workbenchHeightInput.value = p.h;
      updateWorkbenchSize(p.w, p.h);
    }
  };
}

// --------------------------------------------------
// AUDIO
// --------------------------------------------------

function addAudio(item) {
  const tracks =
    item.stream.getAudioTracks();

  if (!tracks.length) return;

  try {
    const source =
      audioContext.createMediaStreamSource(
        item.stream
      );

    const gainNode =
      audioContext.createGain();

    gainNode.gain.value = 1;

    source.connect(gainNode);

    gainNode.connect(audioDestination);

    item.gainNode = gainNode;
  } catch (e) {
    console.warn(e);
  }
}

// --------------------------------------------------
// DRAW COVER
// --------------------------------------------------

function drawCoverVideo(
  ctx,
  video,
  x,
  y,
  width,
  height
) {
  const videoRatio =
    video.videoWidth / video.videoHeight;
  const boxRatio = width / height;

  let drawWidth;
  let drawHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (videoRatio > boxRatio) {
    drawHeight = height;
    drawWidth = height * videoRatio;
    offsetX = (drawWidth - width) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / videoRatio;
    offsetY = (drawHeight - height) / 2;
  }

  ctx.drawImage(
    video,
    x - offsetX,
    y - offsetY,
    drawWidth,
    drawHeight
  );
}

// --------------------------------------------------
// ROUNDED RECT
// --------------------------------------------------

function roundedRect(
  ctx,
  x,
  y,
  width,
  height,
  radiusX,
  radiusY = radiusX
) {
  const rx = Math.min(radiusX, width / 2);
  const ry = Math.min(radiusY, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + width - rx, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + ry);
  ctx.lineTo(x + width, y + height - ry);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - rx,
    y + height
  );
  ctx.lineTo(x + rx, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - ry);
  ctx.lineTo(x, y + ry);
  ctx.quadraticCurveTo(x, y, x + rx, y);
  ctx.closePath();
}

// --------------------------------------------------
// RENDER
// --------------------------------------------------

function render() {
  hiddenStreamCtx.clearRect(
    0,
    0,
    hiddenStreamCanvas.width,
    hiddenStreamCanvas.height
  );

  const sorted = [...scene].sort(
    (a, b) => a.zIndex - b.zIndex
  );

  sorted.forEach((item) => {
    if (item.type === 'microphone') return;

    if (item.video.readyState >= 2) {
      hiddenStreamCtx.save();

      if (item.shape === 'circle') {
        const centerX = item.x + item.width / 2;
        const centerY = item.y + item.height / 2;
        const radius = Math.min(item.width, item.height) / 2;

        hiddenStreamCtx.beginPath();
        hiddenStreamCtx.arc(
          centerX,
          centerY,
          radius,
          0,
          Math.PI * 2
        );
        hiddenStreamCtx.clip();
      } else {
        roundedRect(
          hiddenStreamCtx,
          item.x,
          item.y,
          item.width,
          item.height,
          0,
          0
        );

        hiddenStreamCtx.clip();
      }

      drawCoverVideo(
        hiddenStreamCtx,
        item.video,
        item.x,
        item.y,
        item.width,
        item.height
      );

      hiddenStreamCtx.restore();
    }
  });

  // draw a tiny changing pixel to ensure canvas content changes each frame
  try {
    const c = frameDrawCount % 256;
    hiddenStreamCtx.fillStyle = `rgb(${c},${c},${c})`;
    hiddenStreamCtx.fillRect(0, 0, 1, 1);
  } catch (e) {
    // ignore
  }

  // mark that a frame was drawn
  lastRenderTime = Date.now();
  frameDrawCount += 1;

  requestAnimationFrame(render);
}

render();

function getLiveVideoTrack() {
  // Ensure captureStream matches the canvas size so encoder receives real frames
  try {
    if (hiddenStreamCanvas && typeof hiddenStreamCanvas.captureStream === 'function') {
      const needCreate = !hiddenStream || hiddenStreamCanvas.width !== workbenchWidth || hiddenStreamCanvas.height !== workbenchHeight;
      if (needCreate) {
        try {
          hiddenStream = hiddenStreamCanvas.captureStream(60);
        } catch (e) {
          console.warn('captureStream failed', e);
        }
      }
    }
  } catch (e) {
    console.warn('getLiveVideoTrack error', e);
  }

  if (hiddenStream) {
    return hiddenStream.getVideoTracks()[0] || null;
  }

  return null;
}

// --------------------------------------------------
// LAYERS
// --------------------------------------------------

function refreshLayersPanel() {
  layersPanel.innerHTML = '';

  const sorted = [...scene].sort(
    (a, b) => {
      if (a.type === 'microphone')
        return -1;

      if (b.type === 'microphone')
        return 1;

      return b.zIndex - a.zIndex;
    }
  );

  sorted.forEach((item) => {
    const row =
      document.createElement('div');

    row.className = 'layer-item';
    row.classList.toggle('active', item.focused);

    row.innerHTML = `
      <div>${item.label}</div>
    `;

    row.onclick = (e) => {
      if (
        e.target.closest(
          'select, input, button'
        )
      ) {
        return;
      }

      scene.forEach((other) => {
        other.focused = false;
      });
      item.focused = true;
      if (item.tile) updateTile(item);
      refreshLayersPanel();
    };

    // SHAPE

    if (item.type !== 'microphone') {
      const shapeLabel =
        document.createElement('div');

      shapeLabel.textContent = 'Shape';

      const shapeSelect =
        document.createElement('select');

      ['free', 'circle', 'square'].forEach(
        (shape) => {
          const option =
            document.createElement(
              'option'
            );

          option.value = shape;
          option.textContent =
            shape[0].toUpperCase() +
            shape.slice(1);

          shapeSelect.appendChild(option);
        }
      );

      shapeSelect.value = item.shape;

      shapeSelect.onchange = () => {
        item.shape = shapeSelect.value;
        if (
          item.shape === 'circle' ||
          item.shape === 'square'
        ) {
          const size = Math.min(
            item.width,
            item.height
          );
          item.width = size;
          item.height = size;
        }
        updateTile(item);
        refreshLayersPanel();
      };

      row.appendChild(shapeLabel);
      row.appendChild(shapeSelect);

      const isSquareMode =
        item.shape === 'square' ||
        item.shape === 'circle';

      const sizeLabel =
        document.createElement('div');

      sizeLabel.textContent = isSquareMode
        ? `Size: ${item.width}px`
        : `Width: ${item.width}px`;

      const sizeInput =
        document.createElement('input');

      sizeInput.type = 'number';
      sizeInput.min = 10;
      sizeInput.max = 1280;
      sizeInput.step = 1;
      sizeInput.value = item.width;
      sizeInput.className = 'layer-slider';
      sizeInput.onchange = () => {
        const value = Math.max(
          10,
          Number(sizeInput.value)
        );
        if (isSquareMode) {
          item.width = value;
          item.height = value;
          sizeLabel.textContent =
            `Size: ${value}px`;
        } else {
          item.width = value;
          sizeLabel.textContent =
            `Width: ${item.width}px`;
        }
        updateTile(item);
      };

      row.appendChild(sizeLabel);
      row.appendChild(sizeInput);

      if (!isSquareMode) {
        const heightLabel =
          document.createElement('div');

        heightLabel.textContent =
          `Height: ${item.height}px`;

        const height =
          document.createElement('input');

        height.type = 'number';
        height.min = 10;
        height.max = 720;
        height.step = 1;
        height.value = item.height;
        height.className = 'layer-slider';
        height.onchange = () => {
          item.height = Math.max(10, Number(height.value));
          heightLabel.textContent =
            `Height: ${item.height}px`;
          updateTile(item);
        };

        row.appendChild(heightLabel);
        row.appendChild(height);
      }
    }

    // AUDIO

    const tracks =
      item.stream.getAudioTracks();

    if (tracks.length) {
      const volumeLabel =
        document.createElement('div');

      volumeLabel.textContent = 'Volume';

      const volume =
        document.createElement('input');

      volume.type = 'range';

      volume.min = 0;
      volume.max = 1;

      volume.step = 0.01;

      volume.value = 1;

      volume.className =
        'layer-slider';

      volume.oninput = () => {
        item.gainNode.gain.value =
          volume.value;
      };

      row.appendChild(volumeLabel);
      row.appendChild(volume);

      const mute =
        document.createElement('button');

      mute.textContent = 'Mute';

      mute.onclick = () => {
        tracks[0].enabled =
          !tracks[0].enabled;

        mute.textContent =
          tracks[0].enabled
            ? 'Mute'
            : 'Unmute';
      };

      row.appendChild(mute);
    }

    // CONTROLS

    const controls =
      document.createElement('div');

    controls.className =
      'layer-buttons';

    const focusBtn =
      document.createElement('button');

    focusBtn.textContent = 'FOCUS';

    focusBtn.onclick = () => {
      item.zIndex = zCounter++;
      item.focused = true;
      scene.forEach((other) => {
        if (other !== item) {
          other.focused = false;
        }
      });

      if (item.tile) {
        updateTile(item);
      }

      refreshLayersPanel();
    };

    const up =
      document.createElement('button');

    up.textContent = 'UP';

    up.onclick = () => {
      item.zIndex = zCounter++;

      if (item.tile) {
        updateTile(item);
      }

      refreshLayersPanel();
    };

    const down =
      document.createElement('button');

    down.textContent = 'DOWN';

    down.onclick = () => {
      item.zIndex -= 2;

      if (item.tile) {
        updateTile(item);
      }

      refreshLayersPanel();
    };

    const stop =
      document.createElement('button');

    stop.textContent = 'STOP';

    stop.onclick = () => {
      removeSceneItem(item.id);
    };

    const centerBtn =
      document.createElement('button');

    centerBtn.textContent = 'CENTER';

    centerBtn.onclick = () => {
      item.x = Math.round((workbenchWidth - item.width) / 2);
      item.y = Math.round((workbenchHeight - item.height) / 2);
      if (item.tile) updateTile(item);
      refreshLayersPanel();
    };

    controls.appendChild(focusBtn);
    controls.appendChild(up);
    controls.appendChild(down);
    controls.appendChild(stop);
    controls.appendChild(centerBtn);

    row.appendChild(controls);

    layersPanel.appendChild(row);
  });
}

// --------------------------------------------------
// CREATE ITEM
// --------------------------------------------------

function createSceneItem(
  type,
  stream,
  label,
  deviceId = null
) {
  const video =
    document.createElement('video');

  video.srcObject = stream;

  video.autoplay = true;

  video.playsInline = true;

  video.muted = true;

  video.addEventListener('loadedmetadata', () => {
    video.play().catch(() => {});
  });

  const item = {
    id: crypto.randomUUID(),

    type,
    label,

    stream,
    video,
    deviceId,

    x: 100,
    y: 100,

    width: 320,
    height: 180,

    aspectRatio: 16 / 9,

    shape: 'free',
    borderRadius: 0,

    zIndex: zCounter++,
    focused: false,
  };

  scene.push(item);

  if (item.type !== 'microphone') {
    createTile(item);
  }

  addAudio(item);

  refreshLayersPanel();

  updateSceneInfo();

  log('Created:', item);
}

// --------------------------------------------------
// TILE
// --------------------------------------------------

function createTile(item) {
  const tile =
    document.createElement('div');

  tile.className = 'tile';

  tile.appendChild(item.video);

  if (item.type !== 'microphone') {
    const resize =
      document.createElement('div');

    resize.className =
      'resize-handle';

    tile.appendChild(resize);

    // DRAG

    let dragging = false;

    let offsetX = 0;
    let offsetY = 0;

    tile.addEventListener(
      'mousedown',
      (e) => {
        if (
          e.target.classList.contains(
            'resize-handle'
          )
        ) {
          return;
        }

        dragging = true;

        offsetX =
          e.clientX - item.x;

        offsetY =
          e.clientY - item.y;
      }
    );

    // RESIZE

    let resizing = false;

    let startWidth = 0;
    let startHeight = 0;

    let startMouseX = 0;
    let startMouseY = 0;

    resize.addEventListener(
      'mousedown',
      (e) => {
        e.stopPropagation();

        resizing = true;

        startWidth = item.width;

        startHeight =
          item.height;

        startMouseX =
          e.clientX;

        startMouseY =
          e.clientY;
      }
    );

    window.addEventListener(
      'mousemove',
      (e) => {
        if (dragging) {
          item.x =
            e.clientX -
            offsetX;

          item.y =
            e.clientY -
            offsetY;
        }

        // RESIZE

        if (resizing) {
          const dx =
            e.clientX -
            startMouseX;

          const dy =
            e.clientY -
            startMouseY;

          if (
            item.shape === 'circle' ||
            item.shape === 'square'
          ) {
            const size = Math.max(
              10,
              startWidth + dx
            );
            item.width = size;
            item.height = size;
          } else if (e.shiftKey) {
            item.width = Math.max(
              10,
              startWidth + dx
            );

            item.height = Math.max(
              10,
              item.width / item.aspectRatio
            );
          } else {
            item.width = Math.max(
              10,
              startWidth + dx
            );

            item.height = Math.max(
              10,
              startHeight + dy
            );
          }
        }

        updateTile(item);
      }
    );

    window.addEventListener(
      'mouseup',
      () => {
        if (resizing) {
          refreshLayersPanel();
        }
        dragging = false;
        resizing = false;
      }
    );
  }

  editor.appendChild(tile);

  item.tile = tile;

  updateTile(item);
}

// --------------------------------------------------
// UPDATE TILE
// --------------------------------------------------

function updateTile(item) {
  item.tile.style.left =
    item.x + 'px';

  item.tile.style.top =
    item.y + 'px';

  item.tile.style.width =
    item.width + 'px';

  item.tile.style.height =
    item.height + 'px';

  item.tile.style.zIndex =
    item.zIndex;

  const borderRadius =
    item.shape === 'circle'
      ? 50
      : 0;

  // Keep the tile rectangle (so resize handle stays visible),
  // only round the inner video element when shape is circle.
  item.tile.style.borderRadius = '0%';

  item.video.style.borderRadius =
    borderRadius + '%';

  item.tile.classList.toggle(
    'focused',
    item.focused
  );
}

// --------------------------------------------------
// REMOVE
// --------------------------------------------------

function removeSceneItem(id) {
  const index = scene.findIndex(
    (s) => s.id === id
  );

  if (index === -1) return;

  const item = scene[index];

  item.stream
    .getTracks()
    .forEach((t) => t.stop());

  if (item.tile) {
    item.tile.remove();
  }

  scene.splice(index, 1);

  refreshLayersPanel();

  updateSceneInfo();

  log('Removed:', id);
}


// --------------------------------------------------
// LIVE START
// --------------------------------------------------

startStreamBtn.onclick = () => {
  if (isStoppingLive || isLiveActive) {
    setLiveStatus('Live is stopping or already active. Please wait.');
    return;
  }

  const videoTrack = getLiveVideoTrack();

  if (!videoTrack) {
    livePlaceholder.textContent =
      'Add a camera or screen source before starting live.';
    return;
  }

  if (!isStoppingLive) {
    pendingChunks = [];
  }

  liveSentChunkCount = 0;
  stopLiveSendInterval();
  clearLiveStatus();

  livePreviewWrapper.style.width =
    workbenchWidth + 'px';
  livePreviewWrapper.style.height =
    workbenchHeight + 'px';

  previewVideo.style.borderRadius = '0';
  previewVideo.style.overflow = 'visible';

  finalStream =
    new MediaStream([
      videoTrack,
      ...audioDestination.stream.getAudioTracks(),
    ]);

  previewVideo.srcObject =
    finalStream;

  // Ensure audio context is running so audioDestination has data
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }

  if (isStopCountdown || isLiveActive) {
    setLiveStatus('Live is stopping or already active. Please wait.');
    return;
  }

  isLiveActive = true;
  startStreamBtn.disabled = true;
  stopLiveBtn.disabled = false;

  if (typeof MediaRecorder !== 'undefined') {
    const supportedTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
    ];

    let selectedType = '';
    for (const type of supportedTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedType = type;
        break;
      }
    }

    if (!selectedType) {
      console.warn('No supported MediaRecorder mimeType found. Falling back to default.');
    }

    try {
      const recorder = new MediaRecorder(finalStream, selectedType ? { mimeType: selectedType } : undefined);
      liveRecorder = recorder;

      recorder.onstart = function () {
        console.log('Live recorder started', {
          mimeType: selectedType || 'default',
          state: this.state,
        });
      };

      recorder.ondataavailable = function (event) {
        if (!event.data) {
          console.log('Live recorder data event with no data', new Date().toISOString());
          return;
        }

          console.log('Live recorder data event', event.data.size, 'bytes', event.data.type, new Date().toISOString());

          if (event.data.size === 0) {
            zeroBlobCount += 1;
            // debug helpful info when blobs are empty
            try {
              console.warn('[Workbench] Zero-size blob captured — debugging capture state');
              const vids = scene.map((i) => ({ id: i.id, readyState: i.video.readyState, videoWidth: i.video.videoWidth, videoHeight: i.video.videoHeight }));
              console.warn('[Workbench] capture debug', {
                canvasW: hiddenStreamCanvas.width,
                canvasH: hiddenStreamCanvas.height,
                sceneLength: scene.length,
                videos: vids,
                finalVideoTrackReadyState: finalStream && finalStream.getVideoTracks().length ? finalStream.getVideoTracks()[0].readyState : 'no-track',
                lastRenderTime,
                frameDrawCount
              });
              // try to snapshot canvas as PNG to verify content
              try {
                hiddenStreamCanvas.toBlob((b) => {
                  if (b) console.warn('[Workbench] canvas snapshot size', b.size);
                  else console.warn('[Workbench] canvas snapshot returned null');
                });
              } catch (tbErr) {
                console.warn('canvas.toBlob failed', tbErr);
              }
            } catch (dbgErr) {
              console.warn('Capture debug failed', dbgErr);
            }
            // run a quick diagnostic recorder on first zero
            if (zeroBlobCount === 1) testVideoRecorder();

            // after several zero events, fallback to sending PNG snapshots
            if (zeroBlobCount >= 3) {
              try {
                hiddenStreamCanvas.toBlob((b) => {
                  if (b && b.size > 0) {
                    pendingChunks.push(b);
                    console.log('[Workbench] queued fallback PNG snapshot', b.size, 'bytes');
                  }
                }, 'image/png');
              } catch (e) {
                console.warn('Fallback snapshot failed', e);
              }
            }
          }

          if (event.data.size > 0) {
            zeroBlobCount = 0;
            pendingChunks.push(event.data);
            console.log('Queued live chunk', {
              size: event.data.size,
              queued: pendingChunks.length,
              timestamp: new Date().toISOString(),
            });
          }
      };

      recorder.onstop = function () {
        console.log('Live recorder stopped');
        liveRecorder = null;
        finalizeLiveStop();
      };

      recorder.onerror = function (event) {
        console.warn('Live recorder error', event);
      };

      const startRecording = () => {
        try {
          recorder.start(1000);
          console.log('Live recorder start() called', {
            state: recorder.state,
            trackReadyState: videoTrack.readyState,
          });
          if (isStoppingLive) {
            try {
              recorder.stop();
            } catch (stopErr) {
              console.warn('Stop requested before recorder was ready', stopErr);
            }
          }
        } catch (recordStartError) {
          console.warn('Failed to start live recorder', recordStartError);
        }
      };

      requestAnimationFrame(startRecording);
    } catch (err) {
      console.warn('MediaRecorder unavailable', err);
    }
  } else {
    console.warn('MediaRecorder is not supported in this browser');
  }

  previewVideo.style.display =
    'block';

  livePlaceholder.style.display =
    'none';

  startStreamBtn.style.display =
    'none';

  stopLiveBtn.style.display =
    'block';
  stopLiveBtn.disabled = false;

  setLiveStatus('Live will start in 3...');
  runCountdown('Live starts', () => {
    console.log('[Workbench] Live send started after countdown');
    if (liveRecorder) {
      try {
        liveRecorder.requestData();
      } catch (err) {
        console.warn('Unable to request data after countdown', err);
      }

      if (liveRequestInterval) {
        clearInterval(liveRequestInterval);
      }

      liveRequestInterval = setInterval(() => {
        if (liveRecorder) {
          try {
            liveRecorder.requestData();
          } catch (err) {
            console.warn('Unable to request data during live send', err);
          }
        }
      }, 2000);
    }
    sendPendingChunk();
    ensureLiveSendInterval();
    setLiveStatus('Live is sending');
  });

  log('LIVE STARTED');
  console.log(
    Array.from(finalStream.getTracks()).map((track) => ({
      kind: track.kind,
      label: track.label,
      enabled: track.enabled,
      id: track.id,
      settings: track.getSettings(),
    }))
  );
};

// --------------------------------------------------
// LIVE STOP
// --------------------------------------------------

stopLiveBtn.onclick = () => {
  if (!finalStream || isStoppingLive) return;

  isStoppingLive = true;
  isLiveActive = false;

  clearLiveCountdown();

  stopLiveBtn.style.display = 'none';
  stopLiveBtn.disabled = true;

  setLiveStatus('Stopping live... sending last bytes');

  if (!liveRecorder || liveRecorder.state === 'inactive') {
    pendingChunks = [];
    stopLiveRequestInterval();
    if (finalStream) {
      finalStream.getTracks().forEach((t) => t.stop());
      finalStream = null;
    }
    finalizeLiveStop();
    return;
  }

  if (liveRecorder) {
    try {
      if (liveRecorder.state !== 'inactive') {
        liveRecorder.stop();
      }
    } catch (err) {
      console.warn('Error stopping live recorder', err);
    }
  }

  stopLiveRequestInterval();

  if (finalStream) {
    finalStream.getTracks().forEach((t) => t.stop());
    finalStream = null;
  }

  previewVideo.srcObject = null;
  previewVideo.style.display = 'none';
  livePlaceholder.style.display = 'flex';
  livePreviewWrapper.style.width = workbenchWidth + 'px';
  livePreviewWrapper.style.height = workbenchHeight + 'px';
  previewVideo.style.borderRadius = '0';
  previewVideo.style.overflow = 'visible';
};

// --------------------------------------------------
// DEVICES
// --------------------------------------------------

async function refreshDevices() {
  const devices =
    await navigator.mediaDevices.enumerateDevices();

  cameraList.innerHTML = '';

  micList.innerHTML = '';

  // CAMS

  devices
    .filter(
      (d) =>
        d.kind ===
        'videoinput'
    )
    .forEach((device) => {
      const btn =
        document.createElement(
          'button'
        );

      btn.textContent =
        device.label ||
        'Camera';

      btn.onclick = () =>
        startCamera(
          device.deviceId
        );

      cameraList.appendChild(btn);
    });

  // MICS

  devices
    .filter(
      (d) =>
        d.kind ===
        'audioinput'
    )
    .forEach((device) => {
      const btn =
        document.createElement(
          'button'
        );

      btn.textContent =
        device.label ||
        'Microphone';

      btn.onclick = () =>
        startMicrophone(
          device.deviceId,
          device.label
        );

      micList.appendChild(btn);
    });

  log('Devices refreshed');
}

document
  .getElementById(
    'refreshDevices'
  )
  .onclick = refreshDevices;

// --------------------------------------------------
// CAMERA
// --------------------------------------------------

async function startCamera(
  deviceId
) {
  if (
    scene.some(
      (item) =>
        item.type === 'camera' &&
        item.deviceId === deviceId
    )
  ) {
    log('Camera already added');
    return;
  }

  try {
    const stream =
      await navigator.mediaDevices.getUserMedia(
        {
          video: {
            deviceId,
          },

          audio: false,
        }
      );

    createSceneItem(
      'camera',
      stream,
      'Camera',
      deviceId
    );
  } catch (e) {
    console.warn(e);
  }
}

// --------------------------------------------------
// MICROPHONE
// --------------------------------------------------

async function startMicrophone(
  deviceId,
  label
) {
  if (
    scene.some(
      (item) =>
        item.type === 'microphone' &&
        item.deviceId === deviceId
    )
  ) {
    log('Microphone already added');
    return;
  }

  try {
    const stream =
      await navigator.mediaDevices.getUserMedia(
        {
          audio: {
            deviceId,
          },

          video: false,
        }
      );

    createSceneItem(
      'microphone',
      stream,
      label,
      deviceId
    );
  } catch (e) {
    console.warn(e);
  }
}

// --------------------------------------------------
// SCREEN
// --------------------------------------------------

document
  .getElementById(
    'captureScreenBtn'
  )
  .onclick = async () => {
    try {
      const stream =
        await navigator.mediaDevices.getDisplayMedia(
          {
            video: true,
            audio: true,
          }
        );

      createSceneItem(
        'screen',
        stream,
        'Screen'
      );
    } catch (e) {
      console.warn(e);
    }
  };

// --------------------------------------------------
// STOP ALL
// --------------------------------------------------

document
  .getElementById(
    'stopAllBtn'
  )
  .onclick = () => {
    scene.forEach((item) => {
      item.stream
        .getTracks()
        .forEach((t) =>
          t.stop()
        );

      if (item.tile) {
        item.tile.remove();
      }
    });

    scene = [];

    refreshLayersPanel();

    updateSceneInfo();

    log('All stopped');
  };

// --------------------------------------------------
// INIT
// --------------------------------------------------

refreshDevices();

updateSceneInfo();

console.log(
  'Workbench initialized'
);