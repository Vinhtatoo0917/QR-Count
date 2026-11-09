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

// --- PHÁT ÂM THANH BÍP (WEB AUDIO API) ---
function playBeepSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // 880Hz
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    console.warn('AudioContext không khả dụng:', e);
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

async function openScannerFullscreen() {
  closeResultModal();
  hideCamAlert();

  // 1. Kiểm tra ngữ cảnh HTTPS bắt buộc trên điện thoại
  const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isSecure) {
    alert('LỖI BẢO MẬT: Điện thoại chỉ cho phép mở Camera qua kết nối HTTPS an toàn (hoặc localhost). Nếu bạn đang mở bằng IP nội bộ dạng "http://192.168.x.x", vui lòng đưa lên GitHub Pages hoặc dùng đường dẫn https://.');
    return;
  }

  // 2. Kiểm tra API MediaDevices
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Trình duyệt này không hỗ trợ hoặc đang chặn API Camera. Nếu bạn đang mở link qua Zalo/Messenger/Facebook, vui lòng bấm vào dấu 3 chấm góc trên và chọn "Mở bằng trình duyệt Chrome / Safari".');
    return;
  }

  if (typeof Html5Qrcode === 'undefined') {
    alert('Không thể tải thư viện quét mã QR. Vui lòng kiểm tra lại mạng.');
    return;
  }

  const modal = document.getElementById('cameraFullscreenModal');
  modal.classList.remove('d-none');

  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader");
    }

    const config = {
      fps: 20,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const edge = Math.min(viewfinderWidth, viewfinderHeight) * 0.75;
        return { width: Math.max(edge, 220), height: Math.max(edge, 220) };
      },
      aspectRatio: window.innerHeight / window.innerWidth
    };

    await html5QrCode.start(
      { facingMode: currentCameraFacing },
      config,
      (decodedText) => {
        handleScanSuccess(decodedText);
      },
      () => {
        // Tiếp tục quét
      }
    );

    isScanning = true;
  } catch (err) {
    console.error('Lỗi khi mở camera:', err);
    isScanning = false;
    let msg = '<strong>Không thể truy cập Camera:</strong><br>';
    if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
      msg += 'Quyền truy cập Camera đã bị từ chối.<br>👉 <em>Hãy bấm vào biểu tượng Ổ Khóa hoặc nút "aA" trên thanh địa chỉ URL để cấp quyền Cho phép (Allow) Camera, sau đó thử lại.</em>';
    } else if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
      msg += 'Không tìm thấy thiết bị camera trên máy.';
    } else {
      msg += (err.message || err);
    }
    showCamAlert(msg);
  }
}

async function closeScannerFullscreen() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
    } catch (e) {
      console.warn('Lỗi khi dừng camera:', e);
    }
  }
  isScanning = false;
  document.getElementById('cameraFullscreenModal').classList.add('d-none');
  hideCamAlert();
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
window.deleteRecord = function(key) {
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

window.openEditModal = function(key) {
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

// --- XUẤT CSV CHO EXCEL ---
function exportToCSV() {
  const keys = Object.keys(qrRecords);
  if (keys.length === 0) {
    alert('Chưa có dữ liệu để xuất file CSV.');
    return;
  }

  let csvContent = '\uFEFF';
  csvContent += '"DỮ LIỆU QR","SỐ LƯỢNG"\r\n';

  keys.forEach(key => {
    const escapedValue = key.replace(/"/g, '""');
    csvContent += `"${escapedValue}",${qrRecords[key]}\r\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `QR_Count_${timestamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  reader.onload = function(e) {
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

  // Bấm icon QR để mở Camera Full Màn Hình
  document.getElementById('btnOpenScanner').addEventListener('click', openScannerFullscreen);

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

  // Xuất & Nhập dữ liệu
  document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);
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
});
