# Ứng Dụng Quét Mã QR & Đếm Số Lượng (QR Counter)

Hệ thống web quét mã QR và tự động thống kê số lượng được phát triển bằng HTML5, CSS3 và Vanilla JavaScript thuần, hoạt động hoàn toàn phía trình duyệt (Client-side) mà không cần backend hay database server.

---

## 🚀 Tính Năng Chính

1. **Quét mã QR qua Camera**:
   - Tương thích tốt trên Android, iOS (iPhone/iPad) và Webcam máy tính.
   - Nút bật/tắt camera chủ động.
   - Hỗ trợ đổi camera trước / camera sau (nếu thiết bị có nhiều camera).
   - Khung quét QR trực quan, mượt mà.
   - Cơ chế **chống quét lặp liên tục** khi camera đang giữ nguyên vị trí trên một mã QR (cooldown 2.5s).
   - Lấy chính xác nguyên văn nội dung mã QR (giữ nguyên chữ hoa/thường, khoảng trắng).
   - Không tự ý chuyển hướng hoặc mở link từ QR.

2. **Âm báo & Phản hồi trực quan**:
   - Sử dụng Web Audio API tích hợp sẵn để phát tiếng bip nhẹ nhàng khi quét thành công mà không cần tải file âm thanh ngoài.
   - Có nút bật/tắt âm thanh tùy ý.
   - Hiển thị tức thì mã vừa quét và trạng thái (mã mới hay mã lặp lại).

3. **Bảng thống kê 2 cột dữ liệu**:
   - **DỮ LIỆU QR**: Hiển thị chuỗi văn bản mã QR (mỗi chuỗi chỉ xuất hiện duy nhất 1 lần).
   - **SỐ LƯỢNG**: Quét lần đầu = 1; mỗi lần quét lại sẽ tự động cộng dồn thêm 1.
   - Hỗ trợ chỉnh sửa số lượng trực tiếp bằng nút sửa (bút chì).
   - Hỗ trợ xóa từng dòng hoặc xóa tất cả (kèm xác nhận an toàn).

4. **Lưu trữ & Sao lưu**:
   - Tự động lưu vào `LocalStorage` của trình duyệt ngay lập tức. Tải lại trang không bị mất dữ liệu.
   - **Xuất CSV**: Tương thích hoàn toàn với Microsoft Excel (hỗ trợ UTF-8 BOM hiển thị chuẩn tiếng Việt).
   - **Sao lưu & Khôi phục JSON**: Cho phép tải file cấu hình về máy hoặc nhập lại file JSON (có tùy chọn cộng dồn hoặc ghi đè).

5. **Giao diện & Hiệu năng**:
   - Cực nhẹ, tải tức thì, không framework nặng.
   - Responsive hoàn hảo trên mobile và máy tính.
   - Thanh tìm kiếm mã QR nhanh.
   - Hiển thị thống kê tổng quan: Tổng số loại mã khác nhau & Tổng số lượt quét.

---

## 📁 Cấu Trúc Dự Án

```
qr-scanner/
├── index.html     # Giao diện HTML5 chuẩn semantic & responsive
├── style.css      # Định kiểu CSS3 hiện đại, gọn gàng
├── script.js      # Xử lý logic camera, LocalStorage, CSV, JSON
└── README.md      # Tài liệu hướng dẫn sử dụng và triển khai
```

---

## 💻 Cách Chạy Thử Trên Máy Tính

> **Lưu ý quan trọng về bảo mật Camera của trình duyệt**:  
> Camera chỉ được phép hoạt động trong ngữ cảnh an toàn (**HTTPS** hoặc **`localhost`** / `127.0.0.1`). Nếu mở file trực tiếp dạng `file:///C:/...`, trình duyệt có thể chặn quyền camera.

### Cách 1: Sử dụng Extension "Live Server" trên VS Code (Khuyên dùng)
1. Mở thư mục dự án trong VS Code.
2. Cài đặt tiện ích mở rộng **Live Server** (của Ritwick Dey).
3. Nhấp chuột phải vào file [index.html](file:///c:/Users/AAA/Documents/QR%20Count/index.html) và chọn **"Open with Live Server"**.
4. Trình duyệt sẽ mở tại địa chỉ `http://127.0.0.1:5500` và camera sẽ sẵn sàng hoạt động.

### Cách 2: Sử dụng Python có sẵn trên máy
Mở Terminal/PowerShell tại thư mục dự án và chạy:
```bash
python -m http.server 8000
```
Sau đó truy cập: `http://localhost:8000`.

### Cách 3: Sử dụng Node.js (nếu có)
```bash
npx serve .
```

---

## 🌐 Hướng Dẫn Đưa Lên GitHub & Kích Hoạt GitHub Pages

Vì GitHub Pages tự động cung cấp chứng chỉ **HTTPS miễn phí**, camera trên điện thoại và máy tính sẽ hoạt động ổn định nhất khi đưa lên đây.

### Bước 1: Tạo Repository trên GitHub
1. Truy cập [github.com](https://github.com) và đăng nhập tài khoản của bạn.
2. Nhấn nút **New** (hoặc dấu `+` ở góc trên bên phải) để tạo repository mới.
3. Đặt tên repository (ví dụ: `qr-counter` hoặc `qr-scanner`).
4. Chọn chế độ **Public**.
5. Nhấn **Create repository**.

### Bước 2: Đẩy code từ máy tính lên GitHub
Mở Terminal / PowerShell tại thư mục dự án và chạy các lệnh sau:

```bash
# Khởi tạo git repository
git init

# Thêm tất cả các file
git add .

# Tạo commit đầu tiên
git commit -m "Initial commit: QR Scanner and Counter web app"

# Đổi nhánh chính sang main
git branch -M main

# Liên kết với repository GitHub của bạn (thay username và repo-name bằng thông tin của bạn)
git remote add origin https://github.com/<TEN-TAI-KHOAN>/<TEN-REPOSITORY>.git

# Đẩy code lên GitHub
git push -u origin main
```

*(Hoặc bạn có thể dùng giao diện web của GitHub để upload trực tiếp 4 file `index.html`, `style.css`, `script.js`, `README.md`).*

### Bước 3: Kích hoạt GitHub Pages
1. Trong repository trên GitHub, vào tab **Settings** (Cài đặt).
2. Ở thanh menu bên trái, tìm và chọn mục **Pages** (dưới nhóm *Code and automation*).
3. Trong phần **Build and deployment**:
   - **Source**: Chọn `Deploy from a branch`.
   - **Branch**: Chọn nhánh `main`, thư mục là `/(root)`.
4. Nhấn **Save**.
5. Đợi khoảng 1 - 2 phút, GitHub sẽ cấp cho bạn một đường dẫn trang web có dạng:
   `https://<TEN-TAI-KHOAN>.github.io/<TEN-REPOSITORY>/`

Bây giờ bạn có thể mở link này trên điện thoại (Chrome/Safari), cấp quyền truy cập Camera và bắt đầu quét mã QR!

