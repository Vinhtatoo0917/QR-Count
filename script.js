/**
 * Hệ thống Quét mã QR & Đếm số lượng
 * Trải nghiệm: Nhấn Icon QR -> Bật Camera Full Màn Hình -> Quét xong hiện Thông Báo To & Tắt Camera -> Lặp lại
 */

// --- KHỞI TẠO BIẾN TRẠNG THÁI ---
const STORAGE_KEY = 'qr_counter_data_v1';
let qrRecords = {}; // Format: { "nội dung QR": số lượng }
let html5QrCode = null;
let isScanning = false;
let currentCameraFacing = 'environment'; // 'environment' (sau) hoặc 'user' (trước)

// Quản lý modal sửa số lượng
let currentEditingKey = null;

// --- KHỞI TẠO AUDIO CONTEXT ĐỂ MỞ KHÓA ÂM THANH TRÊN IOS/ANDROID ---
let sharedAudioCtx = null;

function unlockAudioOnMobile() {
  try {
    if (!sharedAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        sharedAudioCtx = new AudioCtx();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
  } catch (e) {
    console.warn('Không thể khởi tạo AudioContext trước:', e);
  }
}

// --- PHÁT ÂM THANH BÍP CỰC TO VÀ RÕ TRÊN MỌI THIẾT BỊ ---
function playBeepSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }

    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }

    const ctx = sharedAudioCtx;
    const now = ctx.currentTime;

    // Tầng âm 1: Sóng vuông (Square wave) có độ đanh và âm lượng vang cực lớn như máy quét siêu thị
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(1400, now); // 1400Hz (tiếng đanh vang)
    gain1.gain.setValueAtTime(0.8, now); // Max volume 80%
    gain1.gain.linearRampToValueAtTime(0.01, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // Tầng âm 2: Sóng sin phụ trợ tạo độ dày tiếng (1800Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1800, now);
    gain2.gain.setValueAtTime(0.5, now);
    gain2.gain.linearRampToValueAtTime(0.01, now + 0.22);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.22);
    osc2.start(now);
    osc2.stop(now + 0.22);

    // Tùy chọn rung máy (Haptic Feedback) trên điện thoại Android
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  } catch (e) {
    console.warn('Lỗi khi phát âm thanh:', e);
  }
}

// --- QUẢN LÝ LOCALSTORAGE ---
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        qrRecords = parsed;
      }
    }
  } catch (e) {
    console.error('Không thể đọc dữ liệu từ LocalStorage:', e);
    qrRecords = {};
  }
  renderTable();
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(qrRecords));
  } catch (e) {
    console.error('Lỗi khi lưu LocalStorage:', e);
    alert('Không thể lưu vào bộ nhớ trình duyệt.');
  }
}

// --- BẬT / TẮT CAMERA FULLSCREEN ---
function showCamAlert(messageHtml) {
  const alertEl = document.getElementById('camAlert');
  if (alertEl) {
    alertEl.innerHTML = messageHtml;
    alertEl.classList.remove('d-none');
  }
}

function hideCamAlert() {
  const alertEl = document.getElementById('camAlert');
  if (alertEl) {
    alertEl.classList.add('d-none');
    alertEl.innerHTML = '';
  }
}

async function closeScannerFullscreen() {
  if (html5QrCode) {
    try {
      const state = html5QrCode.getState();
      // Nếu camera đang chạy (SCANNING hoặc PAUSED) thì phải stop trước
      if (state === 2 || state === 3 || isScanning) { // Html5QrcodeScannerState.SCANNING = 2, PAUSED = 3
        await html5QrCode.stop();
      }
    } catch (e) {
      console.warn('Lỗi khi dừng camera:', e);
    }

    try {
      await html5QrCode.clear();
    } catch (e) {
      console.warn('Lỗi khi clear camera:', e);
    }
  }

  isScanning = false;
  html5QrCode = null; // Reset instance để lần mở sau tạo mới hoàn toàn sạch sẽ
  document.getElementById('cameraFullscreenModal').classList.add('d-none');
  hideCamAlert();
}

async function openScannerFullscreen() {
  closeResultModal();
  hideCamAlert();

  // Đảm bảo dọn dẹp sạch sẽ phiên quét trước nếu còn sót
  if (html5QrCode) {
    try {
      const state = html5QrCode.getState();
      if (state === 2 || state === 3) {
        await html5QrCode.stop();
      }
      await html5QrCode.clear();
    } catch (e) {
      console.warn('Dọn dẹp phiên quét cũ:', e);
    }
    html5QrCode = null;
  }

  const modal = document.getElementById('cameraFullscreenModal');
  modal.classList.remove('d-none');

  try {
    if (typeof Html5Qrcode === 'undefined') {
      throw new Error('Thư viện quét mã chưa được tải. Hãy kiểm tra kết nối mạng.');
    }

    // Tạo instance mới tinh mỗi lần mở camera
    html5QrCode = new Html5Qrcode("reader");

    const config = {
      fps: 30,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const edge = Math.min(viewfinderWidth, viewfinderHeight) * 0.75;
        return { width: Math.max(edge, 220), height: Math.max(edge, 220) };
      },
      aspectRatio: window.innerHeight / window.innerWidth
    };

    // Cách 1: Thử mở bằng camera sau
    try {
      await html5QrCode.start(
        { facingMode: currentCameraFacing },
        config,
        (decodedText) => handleScanSuccess(decodedText),
        () => { }
      );
      isScanning = true;
      return;
    } catch (facingErr) {
      console.warn('Thử dò camera theo ID phần cứng:', facingErr);
    }

    // Cách 2: Dò danh sách camera phần cứng
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      let selectedCam = devices[0].id;
      const backCam = devices.find(d => 
        d.label.toLowerCase().includes('back') || 
        d.label.toLowerCase().includes('sau') || 
        d.label.toLowerCase().includes('environment') ||
        d.label.toLowerCase().includes('rear')
      );
      if (backCam) {
        selectedCam = backCam.id;
      }

      await html5QrCode.start(
        selectedCam,
        config,
        (decodedText) => handleScanSuccess(decodedText),
        () => { }
      );
      isScanning = true;
    } else {
      throw new Error('Không tìm thấy thiết bị camera nào trên máy.');
    }

  } catch (err) {
    console.error('Lỗi khi mở camera trên iOS/PWA:', err);
    isScanning = false;
    let msg = '<strong>Không thể mở Camera trên iPhone/iOS:</strong><br>';
    if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
      msg += 'Quyền Camera trên iPhone chưa được cấp cho biểu tượng này.<br><br>' +
             '👉 <strong>Cách xử lý nhanh nhất:</strong><br>' +
             '1. Vào <strong>Cài đặt (Settings)</strong> của iPhone.<br>' +
             '2. Kéo xuống chọn <strong>Safari</strong>.<br>' +
             '3. Tìm mục <strong>Camera</strong> -> Đổi thành <strong>Cho phép (Allow)</strong> hoặc <strong>Hỏi (Ask)</strong>.<br>' +
             '4. Đóng app QR Count rồi mở lại!';
    } else {
      msg += (err.message || err);
    }
    showCamAlert(msg);
  }
}

async function switchCamera() {
  currentCameraFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
  if (isScanning) {
    await closeScannerFullscreen();
    await openScannerFullscreen();
  }
}

// --- XỬ LÝ KHI QUÉT THÀNH CÔNG ---
async function handleScanSuccess(decodedText) {
  // Lập tức dừng và tắt camera toàn màn hình
  await closeScannerFullscreen();

  const qrKey = String(decodedText);
  let isNew = false;

  if (Object.prototype.hasOwnProperty.call(qrRecords, qrKey)) {
    qrRecords[qrKey] += 1;
  } else {
    qrRecords[qrKey] = 1;
    isNew = true;
  }

  // Lưu ngay vào LocalStorage
  saveData();

  // Cập nhật âm thanh & bảng
  playBeepSound();
  renderTable();
  updateRecentScanDisplay(qrKey, isNew, qrRecords[qrKey]);

  // HIỂN THỊ POPUP THÔNG BÁO TO
  showResultModal(qrKey, isNew, qrRecords[qrKey]);
}

function updateRecentScanDisplay(code, isNew, count) {
  const codeEl = document.getElementById('recentScanCode');
  const badgeEl = document.getElementById('recentScanBadge');

  if (codeEl && badgeEl) {
    codeEl.textContent = code;
    badgeEl.textContent = isNew ? 'Mã mới (x1)' : `Lặp lại (x${count})`;
    badgeEl.className = `recent-badge ${isNew ? 'new' : 'repeat'}`;
  }
}

// --- POPUP THÔNG BÁO TO KHI QUÉT XONG ---
function showResultModal(code, isNew, count) {
  const resultModal = document.getElementById('scanResultModal');
  const textEl = document.getElementById('modalResultText');
  const statusEl = document.getElementById('modalResultStatus');
  const qtyEl = document.getElementById('modalResultQty');

  textEl.textContent = code;
  statusEl.textContent = isNew ? 'MÃ MỚI (LẦN ĐẦU)' : 'MÃ TRÙNG (ĐÃ CỘNG DỒN)';
  statusEl.className = `result-status ${isNew ? 'new' : 'repeat'}`;
  qtyEl.textContent = count;

  resultModal.classList.remove('d-none');
}

function closeResultModal() {
  document.getElementById('scanResultModal').classList.add('d-none');
}

// --- RENDER BẢNG DỮ LIỆU ---
function renderTable() {
  const tbody = document.getElementById('qrTableBody');
  const searchInput = document.getElementById('searchInput');
  const emptyState = document.getElementById('emptyState');
  const totalTypesEl = document.getElementById('totalTypes');
  const totalScansEl = document.getElementById('totalScans');

  const filterText = (searchInput ? searchInput.value : '').toLowerCase();

  const allKeys = Object.keys(qrRecords);
  let totalScans = 0;
  allKeys.forEach(k => {
    totalScans += qrRecords[k];
  });

  totalTypesEl.textContent = allKeys.length.toLocaleString();
  totalScansEl.textContent = totalScans.toLocaleString();

  const displayKeys = allKeys.filter(k => k.toLowerCase().includes(filterText));

  if (allKeys.length === 0 || displayKeys.length === 0) {
    emptyState.classList.remove('d-none');
    tbody.innerHTML = '';
    return;
  }

  emptyState.classList.add('d-none');

  let rowsHtml = '';
  displayKeys.forEach((key, index) => {
    const qty = qrRecords[key];
    const escapedKey = escapeHtml(key);

    rowsHtml += `
      <tr>
        <td class="col-index">${index + 1}</td>
        <td class="col-qr"><div class="qr-text-cell">${escapedKey}</div></td>
        <td class="col-qty"><span class="qty-badge">${qty}</span></td>
        <td class="col-action">
          <div class="table-actions">
            <button class="btn-icon" onclick="openEditModal(${JSON.stringify(key)})" title="Sửa số lượng">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
            <button class="btn-icon danger" onclick="deleteRecord(${JSON.stringify(key)})" title="Xóa dòng này">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- THAO TÁC XÓA & SỬA ---
window.deleteRecord = function (key) {
  if (confirm(`Bạn có chắc muốn xóa mã sau khỏi danh sách?\n\n"${key}"`)) {
    delete qrRecords[key];
    saveData();
    renderTable();
  }
};

function clearAllRecords() {
  const total = Object.keys(qrRecords).length;
  if (total === 0) {
    alert('Danh sách hiện tại đang trống.');
    return;
  }
  const answer = confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ ${total} loại mã QR đã quét không?\nThao tác này không thể hoàn tác!`);
  if (answer) {
    qrRecords = {};
    saveData();
    renderTable();
    document.getElementById('recentScanCode').textContent = '-';
    document.getElementById('recentScanBadge').textContent = '';
    document.getElementById('recentScanBadge').className = 'recent-badge';
  }
}

// --- MODAL SỬA SỐ LƯỢNG THỦ CÔNG ---
const editModal = document.getElementById('editModal');
const editItemCode = document.getElementById('editItemCode');
const editQtyInput = document.getElementById('editQtyInput');

window.openEditModal = function (key) {
  currentEditingKey = key;
  editItemCode.textContent = key;
  editQtyInput.value = qrRecords[key] || 1;
  editModal.classList.remove('d-none');
  editQtyInput.focus();
};

function closeEditModal() {
  currentEditingKey = null;
  editModal.classList.add('d-none');
}

function saveEditModal() {
  if (currentEditingKey === null) return;
  const newQty = parseInt(editQtyInput.value, 10);
  if (isNaN(newQty) || newQty < 1) {
    alert('Số lượng phải là số nguyên dương lớn hơn hoặc bằng 1.');
    return;
  }
  qrRecords[currentEditingKey] = newQty;
  saveData();
  renderTable();
  closeEditModal();
}

// --- XUẤT CSV CHO EXCEL & TỰ ĐỘNG BẬT MENU CHIA SẺ (WEB SHARE API) ---
async function exportToCSV() {
  const keys = Object.keys(qrRecords);
  if (keys.length === 0) {
    alert('Chưa có dữ liệu để xuất file CSV.');
    return;
  }

  // Tiêu đề UTF-8 BOM để Excel hiển thị đúng tiếng Việt
  let csvContent = '\uFEFF';
  csvContent += '"DỮ LIỆU QR","SỐ LƯỢNG"\r\n';

  keys.forEach(key => {
    const escapedValue = key.replace(/"/g, '""');
    csvContent += `"${escapedValue}",${qrRecords[key]}\r\n`;
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  const fileName = `QR_Count_${timestamp}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const file = new File([blob], fileName, { type: 'text/csv;charset=utf-8;' });

  // 1. Tự động kích hoạt menu chia sẻ của điện thoại (Zalo, Drive, Gmail, v.v.)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: 'Báo cáo thống kê quét mã QR',
        text: `Danh sách quét mã QR ngày ${timestamp}`,
        files: [file]
      });
      return; // Người dùng đã chia sẻ thành công
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Không thể mở menu chia sẻ file:', err);
      } else {
        return; // Người dùng chủ động bấm hủy menu chia sẻ
      }
    }
  }

  // 2. Fallback: Nếu mở trên máy tính hoặc trình duyệt không hỗ trợ share file -> Tự động tải về máy
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- NHẬP LẠI DỮ LIỆU TỪ FILE EXCEL (CSV) ---
function parseCSV(text) {
  // Loại bỏ BOM nếu có
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const result = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Bỏ qua dòng tiêu đề nếu có
    if (i === 0 && (line.includes('DỮ LIỆU') || line.includes('SỐ LƯỢNG') || line.toLowerCase().includes('qr'))) {
      continue;
    }

    // Tách cột bằng dấu phẩy theo chuẩn CSV (hỗ trợ dấu ngoặc kép)
    let parts = [];
    let insideQuotes = false;
    let currentPart = '';

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        if (insideQuotes && line[c + 1] === '"') {
          currentPart += '"';
          c++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        parts.push(currentPart);
        currentPart = '';
      } else {
        currentPart += char;
      }
    }
    parts.push(currentPart);

    if (parts.length >= 2) {
      const qrData = parts[0].trim();
      const qtyStr = parts[1].trim();
      const qty = parseInt(qtyStr, 10);

      if (qrData && !isNaN(qty) && qty > 0) {
        result[qrData] = (result[qrData] || 0) + qty;
      }
    } else if (parts.length === 1 && parts[0].trim().length > 0) {
      // Trường hợp người dùng nhập file chỉ có danh sách mã (mỗi dòng 1 mã, mặc định số lượng = 1)
      const qrData = parts[0].trim();
      result[qrData] = (result[qrData] || 0) + 1;
    }
  }

  return result;
}

function handleImportCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const text = e.target.result;
      const data = parseCSV(text);
      const keys = Object.keys(data);

      if (keys.length === 0) {
        throw new Error('Không tìm thấy dữ liệu hợp lệ trong file Excel CSV.');
      }

      const merge = confirm(`Tìm thấy ${keys.length} loại mã trong file Excel.\n\nBạn muốn GỘP vào danh sách hiện tại?\n- Bấm "OK" để GỘP (cộng dồn số lượng).\n- Bấm "Cancel" để GHI ĐÈ thay thế danh sách cũ.`);

      if (merge) {
        for (const [k, v] of Object.entries(data)) {
          qrRecords[k] = (qrRecords[k] || 0) + v;
        }
      } else {
        qrRecords = {};
        for (const [k, v] of Object.entries(data)) {
          qrRecords[k] = v;
        }
      }

      saveData();
      renderTable();
      alert(`Đã nhập thành công ${keys.length} mã từ file Excel!`);
    } catch (err) {
      console.error(err);
      alert('Lỗi khi đọc file Excel CSV: ' + err.message);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file, 'utf-8');
}

// --- SAO LƯU & NHẬP JSON ---
function exportToJSON() {
  const keys = Object.keys(qrRecords);
  if (keys.length === 0) {
    alert('Chưa có dữ liệu để xuất JSON.');
    return;
  }

  const jsonStr = JSON.stringify(qrRecords, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `QR_Backup_${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleImportJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Định dạng JSON không hợp lệ.');
      }

      const merge = confirm('Bạn muốn GỘP dữ liệu mới vào dữ liệu hiện tại?\n\n- Nhấn "OK" để GỘP (cộng dồn số lượng).\n- Nhấn "Cancel" để GHI ĐÈ hoàn toàn danh sách cũ.');

      if (merge) {
        for (const [k, v] of Object.entries(data)) {
          const qty = parseInt(v, 10) || 0;
          if (qty > 0) {
            qrRecords[k] = (qrRecords[k] || 0) + qty;
          }
        }
      } else {
        qrRecords = {};
        for (const [k, v] of Object.entries(data)) {
          const qty = parseInt(v, 10) || 0;
          if (qty > 0) {
            qrRecords[k] = qty;
          }
        }
      }

      saveData();
      renderTable();
      alert('Nhập dữ liệu thành công!');
    } catch (err) {
      console.error(err);
      alert('Lỗi khi đọc file JSON: ' + err.message);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

// --- GÁN SỰ KIỆN KHI TRANG TẢI XONG ---
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  // Bấm icon QR để mở Camera Full Màn Hình & Kích hoạt âm thanh
  document.getElementById('btnOpenScanner').addEventListener('click', () => {
    unlockAudioOnMobile();
    openScannerFullscreen();
  });

  // Kích hoạt âm thanh khi người dùng bấm bất kỳ đâu lần đầu tiên trên màn hình
  document.body.addEventListener('touchstart', unlockAudioOnMobile, { once: true });
  document.body.addEventListener('click', unlockAudioOnMobile, { once: true });

  // Nút X đóng camera
  document.getElementById('btnCloseScanner').addEventListener('click', closeScannerFullscreen);

  // Nút đổi camera trước/sau
  document.getElementById('btnSwitchCam').addEventListener('click', switchCamera);

  // Nút trong Popup thông báo kết quả quét:
  // "Quét tiếp mã khác" -> đóng popup và mở lại camera ngay lập tức
  document.getElementById('btnScanNext').addEventListener('click', () => {
    openScannerFullscreen();
  });
  // "Xem bảng thống kê" -> đóng popup
  document.getElementById('btnCloseResult').addEventListener('click', closeResultModal);

  // Tìm kiếm
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  searchInput.addEventListener('input', () => {
    if (searchInput.value.trim().length > 0) {
      btnClearSearch.classList.remove('d-none');
    } else {
      btnClearSearch.classList.add('d-none');
    }
    renderTable();
  });

  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    btnClearSearch.classList.add('d-none');
    renderTable();
  });

  // Xuất & Nhập dữ liệu CSV (Excel)
  document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);
  const fileInputCSV = document.getElementById('fileInputCSV');
  document.getElementById('btnImportCSV').addEventListener('click', () => fileInputCSV.click());
  fileInputCSV.addEventListener('change', handleImportCSV);

  // Xuất & Nhập dữ liệu JSON
  document.getElementById('btnExportJSON').addEventListener('click', exportToJSON);
  const fileInput = document.getElementById('fileInputJSON');
  document.getElementById('btnImportJSON').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleImportJSON);

  // Xóa tất cả
  document.getElementById('btnClearAll').addEventListener('click', clearAllRecords);

  // Modal Sửa
  document.getElementById('btnCancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('btnSaveEdit').addEventListener('click', saveEditModal);
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });

  // Đăng ký Service Worker cho Progressive Web App (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  }
});
