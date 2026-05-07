const DB_NAME = 'sop-testapp-db';
const STORE_NAME = 'records';
const DB_VERSION = 1;

let db;
let editingId = null;
let currentImageBlob = null;

const form = document.getElementById('record-form');
const formTitle = document.getElementById('form-title');
const photoInput = document.getElementById('photo');
const noteInput = document.getElementById('note');
const preview = document.getElementById('photo-preview');
const recordsList = document.getElementById('records-list');
const emptyState = document.getElementById('empty-state');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const deleteBtn = document.getElementById('delete-btn');
const exportBtn = document.getElementById('export-btn');
const importInput = document.getElementById('import-input');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#991b1b' : '#065f46';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txn(mode) {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function idbRequestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllRecords() {
  const items = await idbRequestToPromise(txn('readonly').getAll());
  return items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function saveRecord(record) {
  await idbRequestToPromise(txn('readwrite').put(record));
}

async function deleteRecord(id) {
  await idbRequestToPromise(txn('readwrite').delete(id));
}

function truncate(text, max = 80) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function getImageExtension(type = '') {
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  return 'jpg';
}

function isSafeImageBlob(blob) {
  return blob instanceof Blob && typeof blob.type === 'string' && blob.type.startsWith('image/');
}

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function drawImageToCanvas(canvas, imageBitmap, width, height) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = width;
  canvas.height = height;
  context.drawImage(imageBitmap, 0, 0, width, height);
}

async function showPreview(blob) {
  try {
    if (!isSafeImageBlob(blob)) {
      preview.classList.add('hidden');
      const context = preview.getContext('2d');
      if (context) {
        context.clearRect(0, 0, preview.width, preview.height);
      }
      return;
    }
    if (typeof createImageBitmap !== 'function') {
      setStatus('Image preview is not supported in this browser.', true);
      return;
    }

    const imageBitmap = await createImageBitmap(blob);
    const maxHeight = 260;
    const ratio = imageBitmap.width / imageBitmap.height || 1;
    const height = Math.min(imageBitmap.height, maxHeight);
    const width = Math.max(1, Math.round(height * ratio));

    drawImageToCanvas(preview, imageBitmap, width, height);
    imageBitmap.close();
    preview.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    setStatus('Failed to render image preview.', true);
  }
}

function resetForm() {
  editingId = null;
  currentImageBlob = null;
  form.reset();
  showPreview(null);
  formTitle.textContent = 'New record';
  saveBtn.textContent = 'Save record';
  cancelBtn.classList.add('hidden');
  deleteBtn.classList.add('hidden');
}

function setEditingMode(record) {
  editingId = record.id;
  currentImageBlob = isSafeImageBlob(record.imageBlob) ? record.imageBlob : null;
  noteInput.value = record.text || '';
  formTitle.textContent = 'Edit record';
  saveBtn.textContent = 'Update record';
  cancelBtn.classList.remove('hidden');
  deleteBtn.classList.remove('hidden');
  showPreview(currentImageBlob);
}

function createRecordElement(record) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'record-item';

  const img = document.createElement('canvas');
  if (isSafeImageBlob(record.imageBlob)) {
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(record.imageBlob)
        .then((imageBitmap) => {
          drawImageToCanvas(img, imageBitmap, 64, 64);
          imageBitmap.close();
        })
        .catch((error) => {
          console.error(error);
        });
    }
  }

  const meta = document.createElement('div');
  meta.className = 'record-meta';

  const note = document.createElement('p');
  note.className = 'record-note';
  note.textContent = truncate(record.text || '(No note)');

  const time = document.createElement('p');
  time.className = 'record-time';
  time.textContent = new Date(record.updatedAt || record.createdAt).toLocaleString();

  meta.append(note, time);
  button.append(img, meta);
  button.addEventListener('click', () => setEditingMode(record));
  li.appendChild(button);
  return li;
}

async function renderRecords() {
  const records = await getAllRecords();
  recordsList.innerHTML = '';
  records.forEach((record) => recordsList.appendChild(createRecordElement(record)));
  emptyState.classList.toggle('hidden', records.length > 0);
}

async function handleSubmit(event) {
  event.preventDefault();
  const text = noteInput.value.trim();
  if (!text && !currentImageBlob) {
    setStatus('Add a note or image before saving.', true);
    return;
  }

  const now = new Date().toISOString();
  let record;

  if (editingId) {
    const existing = await idbRequestToPromise(txn('readonly').get(editingId));
    if (!existing) {
      setStatus('Record not found.', true);
      resetForm();
      await renderRecords();
      return;
    }
    record = {
      ...existing,
      text,
      imageBlob: currentImageBlob || existing.imageBlob || null,
      imageType: (currentImageBlob || existing.imageBlob)?.type || existing.imageType || 'image/jpeg',
      updatedAt: now,
    };
  } else {
    const id = makeId();
    record = {
      id,
      text,
      imageBlob: isSafeImageBlob(currentImageBlob) ? currentImageBlob : null,
      imageType: currentImageBlob?.type || 'image/jpeg',
      createdAt: now,
      updatedAt: now,
    };
  }

  await saveRecord(record);
  setStatus(editingId ? 'Record updated.' : 'Record saved.');
  resetForm();
  await renderRecords();
}

photoInput.addEventListener('change', () => {
  const [file] = photoInput.files || [];
  if (!isSafeImageBlob(file)) {
    currentImageBlob = null;
    showPreview(null);
    setStatus('Please select an image file.', true);
    return;
  }
  currentImageBlob = file;
  showPreview(file);
});

cancelBtn.addEventListener('click', () => {
  resetForm();
  setStatus('Edit cancelled.');
});

deleteBtn.addEventListener('click', async () => {
  if (!editingId) return;
  await deleteRecord(editingId);
  setStatus('Record deleted.');
  resetForm();
  await renderRecords();
});

form.addEventListener('submit', (event) => {
  handleSubmit(event).catch((error) => {
    console.error(error);
    setStatus('Failed to save record.', true);
  });
});

exportBtn.addEventListener('click', async () => {
  try {
    if (!window.JSZip) {
      setStatus('ZIP library not loaded.', true);
      return;
    }
    const records = await getAllRecords();
    const zip = new JSZip();
    const imagesFolder = zip.folder('images');

    const metadata = records.map((record) => {
      let filename = null;
      if (isSafeImageBlob(record.imageBlob) && imagesFolder) {
        const ext = getImageExtension(record.imageType || record.imageBlob.type || 'image/jpeg');
        filename = `${record.id}.${ext}`;
        imagesFolder.file(filename, record.imageBlob);
      }
      return {
        id: record.id,
        text: record.text,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        imageType: record.imageType || null,
        filename,
      };
    });

    zip.file('records.json', JSON.stringify(metadata, null, 2));
    const blob = await zip.generateAsync({ type: 'blob' });

    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `sop-records-${stamp}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${records.length} record(s).`);
  } catch (error) {
    console.error(error);
    setStatus('Export failed.', true);
  }
});

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  importInput.value = '';
  if (!file) return;
  if (!window.JSZip) {
    setStatus('ZIP library not loaded.', true);
    return;
  }

  try {
    const zip = await JSZip.loadAsync(file);
    const metadataEntry = zip.file('records.json');
    if (!metadataEntry) {
      setStatus('records.json was not found in ZIP.', true);
      return;
    }

    const metadata = JSON.parse(await metadataEntry.async('string'));
    if (!Array.isArray(metadata)) {
      setStatus('records.json has invalid format.', true);
      return;
    }

    let importedCount = 0;
    for (const item of metadata) {
      if (!item || typeof item !== 'object' || !item.id) continue;
      let imageBlob = null;
      if (item.filename) {
        const imageEntry = zip.file(`images/${item.filename}`) || zip.file(item.filename);
        if (imageEntry) {
          const raw = await imageEntry.async('uint8array');
          const imageType = typeof item.imageType === 'string' ? item.imageType : 'application/octet-stream';
          imageBlob = new Blob([raw], { type: imageType });
        }
      }
      await saveRecord({
        id: item.id,
        text: typeof item.text === 'string' ? item.text : '',
        imageBlob: isSafeImageBlob(imageBlob) ? imageBlob : null,
        imageType: item.imageType || imageBlob?.type || 'image/jpeg',
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      });
      importedCount += 1;
    }

    await renderRecords();
    resetForm();
    setStatus(`Imported ${importedCount} record(s).`);
  } catch (error) {
    console.error(error);
    setStatus('Import failed.', true);
  }
});

async function bootstrap() {
  try {
    db = await openDb();
    await renderRecords();

    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('./sw.js');
    }
  } catch (error) {
    console.error(error);
    setStatus('Failed to initialize app.', true);
  }
}

bootstrap();
