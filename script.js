/**
 * Hệ thống Quét mã QR & Đếm số lượng
 * Công nghệ: Vanilla JavaScript (Không framework, lưu LocalStorage)
 */

// --- KHỞI TẠO BIẾN TRẠNG THÁI ---
const STORAGE_KEY = 'qr_counter_data_v1';
let qrRecords = {}; // Format: { "nội dung QR chính xác": số lượng }
let html5QrCode = null;
let isScanning = false;
let currentCameraFacing = 'environment'; // 'environment' (sau) hoặc 'user' (trước)

// Cơ chế chống quét lặp liên tục cùng 1 mã khi camera vẫn đang nhìn vào mã
let lastScannedCode = null;
let lastScannedTime = 0;
const DUPLICATE_COOLDOWN_MS = 2500; // Thời gian giãn cách giữa 2 lần quét cùng 1 mã (2.5 giây)

// Quản lý chỉnh sửa số lượng thủ công
let currentEditingKey = null;

// --- PHÁT ÂM THANH BẰNG WEB AUDIO API (Không cần tải file mp3 bên ngoài) ---
function playBeepSound() {
  const chkSound = document.getElementById('chkSound');
  if (!chkSound || !chkSound.checked) return;

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // Âm 880Hz (A5)
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {
    console.warn('AudioContext không được hỗ trợ hoặc bị chặn:', e);
  }
}

// --- QUẢN LÝ LƯU TRỮ VÀ DỮ LIỆU ---
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
    alert('Không thể lưu vào bộ nhớ trình duyệt (LocalStorage đầy hoặc bị tắt).');
  }
}

// --- XỬ LÝ KẾT QUẢ QUÉT ĐƯỢC ---
function handleScanSuccess(decodedText) {
  // Đảm bảo không chỉnh sửa, cắt bớt khoảng trắng hay đổi hoa/thường
  const qrKey = String(decodedText);
  const now = Date.now();

  // Chống quét lặp liên tục cùng một mã nếu camera chưa rời khỏi mã
  if (qrKey === lastScannedCode && (now - lastScannedTime) < DUPLICATE_COOLDOWN_MS) {
    return;
  }

  lastScannedCode = qrKey;
  lastScannedTime = now;

  let isNew = false;
  if (Object.prototype.hasOwnProperty.call(qrRecords, qrKey)) {
    qrRecords[qrKey] += 1;
  } else {
    qrRecords[qrKey] = 1;
    isNew = true;
  }

  // Lưu ngay vào LocalStorage
  saveData();

  // Cập nhật giao diện
  updateRecentScanDisplay(qrKey, isNew, qrRecords[qrKey]);
  playBeepSound();
  renderTable();
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

  // Lọc theo tìm kiếm
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
    // Thoát HTML chống XSS nhưng vẫn giữ nguyên vẹn nội dung khi render
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

// --- QUẢN LÝ CAMERA SCANNER ---
function showCamAlert(message) {
  const alertEl = document.getElementById('camAlert');
  if (alertEl) {
    alertEl.textContent = message;
    alertEl.classList.remove('d-none');
  }
}

function hideCamAlert() {
  const alertEl = document.getElementById('camAlert');
  if (alertEl) {
    alertEl.classList.add('d-none');
    alertEl.textContent = '';
  }
}

async function startScan() {
  hideCamAlert();

  // Kiểm tra hỗ trợ camera & ngữ cảnh an toàn (HTTPS / localhost)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCamAlert('Trình duyệt không hỗ trợ hoặc đang chạy trên HTTP không an toàn. Vui lòng mở qua HTTPS (hoặc localhost) và cho phép quyền truy cập Camera.');
    return;
  }

  if (typeof Html5Qrcode === 'undefined') {
    showCamAlert('Không thể tải thư viện quét mã QR. Vui lòng kiểm tra kết nối mạng.');
    return;
  }

  const placeholder = document.getElementById('cameraPlaceholder');
  const btnStart = document.getElementById('btnStartScan');
  const btnStop = document.getElementById('btnStopScan');
  const statusEl = document.getElementById('scanStatus');

  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader");
    }

    const config = {
      fps: 15,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    };

    placeholder.classList.add('d-none');
    statusEl.textContent = 'Đang khởi động camera...';

    await html5QrCode.start(
      { facingMode: currentCameraFacing },
      config,
      (decodedText) => {
        handleScanSuccess(decodedText);
      },
      () => {
        // Callback khi không quét thấy QR trong frame hiện tại -> bỏ qua để giữ hiệu năng nhẹ
      }
    );

    isScanning = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    statusEl.textContent = 'Đang quét...';
    statusEl.classList.add('active');
  } catch (err) {
    console.error('Lỗi khi mở camera:', err);
    placeholder.classList.remove('d-none');
    isScanning = false;
    btnStart.disabled = false;
    btnStop.disabled = true;
    statusEl.textContent = 'Lỗi camera';
    statusEl.classList.remove('active');

    let errorMsg = 'Không thể bật camera. ';
    if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
      errorMsg += 'Vui lòng cấp quyền (Allow) truy cập camera trên trình duyệt.';
    } else if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
      errorMsg += 'Không tìm thấy camera trên thiết bị của bạn.';
    } else {
      errorMsg += (err.message || err);
    }
    showCamAlert(errorMsg);
  }
}

async function stopScan() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
    } catch (e) {
      console.warn('Lỗi khi dừng camera:', e);
    }
  }

  isScanning = false;
  document.getElementById('cameraPlaceholder').classList.remove('d-none');
  document.getElementById('btnStartScan').disabled = false;
  document.getElementById('btnStopScan').disabled = true;
  const statusEl = document.getElementById('scanStatus');
  statusEl.textContent = 'Đã dừng';
  statusEl.classList.remove('active');
}

async function switchCamera() {
  currentCameraFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
  if (isScanning) {
    await stopScan();
    await startScan();
  }
}

// --- THAO TÁC XÓA DỮ LIỆU ---
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

// --- CHỈNH SỬA SỐ LƯỢNG THỦ CÔNG ---
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

  // BOM UTF-8 (\uFEFF) giúp Excel hiển thị đúng tiếng Việt và ký tự đặc biệt
  let csvContent = '\uFEFF';
  csvContent += '"DỮ LIỆU QR","SỐ LƯỢNG"\r\n';

  keys.forEach(key => {
    // Escape dấu ngoặc kép bằng 2 dấu ngoặc kép theo chuẩn RFC 4180
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
        throw new Error('Định dạng JSON không hợp lệ. Phải là một object chứa các cặp mã và số lượng.');
      }

      // Kiểm tra tính hợp lệ của dữ liệu
      let validCount = 0;
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'number' && v >= 0) {
          validCount++;
        }
      }

      if (validCount === 0 && Object.keys(data).length > 0) {
        throw new Error('Không tìm thấy dữ liệu số lượng hợp lệ trong file.');
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
      event.target.value = ''; // Reset input file
    }
  };
  reader.readAsText(file);
}

// --- GÁN SỰ KIỆN KHI TRANG SẴN SÀNG ---
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  // Nút Camera
  document.getElementById('btnStartScan').addEventListener('click', startScan);
  document.getElementById('btnStopScan').addEventListener('click', stopScan);
  document.getElementById('btnSwitchCam').addEventListener('click', switchCamera);

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

