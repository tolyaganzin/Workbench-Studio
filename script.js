const editor =
  document.getElementById('editor');

const canvas =
  document.getElementById('streamCanvas');

const ctx = canvas.getContext('2d');

const previewVideo =
  document.getElementById('previewVideo');

const livePlaceholder =
  document.getElementById('livePlaceholder');

const startStreamBtn =
  document.getElementById('startStreamBtn');

const stopLiveBtn =
  document.getElementById('stopLiveBtn');

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

  canvas.width = workbenchWidth;
  canvas.height = workbenchHeight;

  canvas.style.width =
    workbenchWidth + 'px';
  canvas.style.height =
    workbenchHeight + 'px';

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
    video.videoWidth /
    video.videoHeight;

  const boxRatio = width / height;

  let drawWidth;
  let drawHeight;

  let offsetX = 0;
  let offsetY = 0;

  if (videoRatio > boxRatio) {
    drawHeight = height;

    drawWidth =
      height * videoRatio;

    offsetX =
      (drawWidth - width) / 2;
  } else {
    drawWidth = width;

    drawHeight =
      width / videoRatio;

    offsetY =
      (drawHeight - height) / 2;
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

  ctx.lineTo(
    x + width - rx,
    y
  );

  ctx.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + ry
  );

  ctx.lineTo(
    x + width,
    y + height - ry
  );

  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - rx,
    y + height
  );

  ctx.lineTo(
    x + rx,
    y + height
  );

  ctx.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - ry
  );

  ctx.lineTo(x, y + ry);

  ctx.quadraticCurveTo(
    x,
    y,
    x + rx,
    y
  );

  ctx.closePath();
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
        updateTile(item);
      };

      row.appendChild(shapeLabel);
      row.appendChild(shapeSelect);

      const widthLabel =
        document.createElement('div');

      widthLabel.textContent =
        `Width: ${item.width}px`;

      const width =
        document.createElement('input');

      width.type = 'number';
      width.min = 10;
      width.max = 1280;
      width.step = 1;
      width.value = item.width;
      width.className = 'layer-slider';
      width.onchange = () => {
        item.width = Math.max(10, Number(width.value));
        widthLabel.textContent =
          `Width: ${item.width}px`;
        updateTile(item);
      };

      row.appendChild(widthLabel);
      row.appendChild(width);

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

          if (e.shiftKey) {
            item.width =
              startWidth + dx;

            item.height =
              item.width /
              item.aspectRatio;
          } else {
            item.width =
              startWidth + dx;

            item.height =
              startHeight + dy;
          }
        }

        updateTile(item);
      }
    );

    window.addEventListener(
      'mouseup',
      () => {
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
// RENDER
// --------------------------------------------------

function render() {
  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const sorted = [...scene].sort(
    (a, b) => a.zIndex - b.zIndex
  );

  sorted.forEach((item) => {
    if (item.type === 'microphone') return;

    if (
      item.video.readyState >= 2
    ) {
      ctx.save();

      let radiusX = 0;
      let radiusY = 0;

      if (item.shape === 'circle') {
        const radius =
          Math.min(
            item.width,
            item.height
          ) / 2;

        radiusX = radius;
        radiusY = radius;
      }

      roundedRect(
        ctx,
        item.x,
        item.y,
        item.width,
        item.height,
        radiusX,
        radiusY
      );

      ctx.clip();

      drawCoverVideo(
        ctx,
        item.video,
        item.x,
        item.y,
        item.width,
        item.height
      );

      ctx.restore();
    }
  });

  requestAnimationFrame(render);
}

render();

// --------------------------------------------------
// LIVE START
// --------------------------------------------------

startStreamBtn.onclick = () => {
  const canvasStream =
    canvas.captureStream(60);

  finalStream =
    new MediaStream([
      ...canvasStream.getVideoTracks(),

      ...audioDestination.stream.getAudioTracks(),
    ]);

  previewVideo.srcObject =
    finalStream;

  previewVideo.style.display =
    'block';

  livePlaceholder.style.display =
    'none';

  startStreamBtn.style.display =
    'none';

  stopLiveBtn.style.display =
    'block';

  log('LIVE STARTED');

  console.log(finalStream);
};

// --------------------------------------------------
// LIVE STOP
// --------------------------------------------------

stopLiveBtn.onclick = () => {
  if (!finalStream) return;

  finalStream
    .getTracks()
    .forEach((t) => t.stop());

  previewVideo.srcObject =
    null;

  previewVideo.style.display =
    'none';

  livePlaceholder.style.display =
    'flex';

  startStreamBtn.style.display =
    'block';

  stopLiveBtn.style.display =
    'none';

  finalStream = null;

  log('LIVE STOPPED');
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