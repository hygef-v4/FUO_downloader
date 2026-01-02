# Fuo Image Downloader - Chrome Extension

Chrome extension để tải xuống hình ảnh từ các trang web (đặc biệt tối ưu cho fuoverflow.com) về một thư mục.

## Tính năng

- 🔍 Quét và phát hiện tất cả hình ảnh trên trang web
- 📥 Tải xuống nhiều hình ảnh cùng lúc
- 📁 Lưu vào thư mục tùy chỉnh
- ✅ Hiển thị số lượng hình ảnh tìm thấy
- 🎯 Tối ưu cho fuoverflow.com và các website khác

## Cài đặt

1. Mở Chrome và truy cập `chrome://extensions/`
2. Bật "Developer mode" (chế độ nhà phát triển) ở góc trên bên phải
3. Click "Load unpacked" (Tải tiện ích đã giải nén)
4. Chọn thư mục `Fuo_downloader` này
5. Extension sẽ xuất hiện trong thanh công cụ của Chrome

## Cách sử dụng

1. Mở trang web có hình ảnh bạn muốn tải (ví dụ: fuoverflow.com)
2. Click vào icon của extension trên thanh công cụ
3. Nhập tên thư mục muốn lưu (hoặc để mặc định)
4. Click "Scan for Images" để quét hình ảnh
5. Xem danh sách hình ảnh được tìm thấy
6. Click "Download All Images" để tải tất cả về

## Lưu ý

- Hình ảnh sẽ được lưu vào thư mục Downloads mặc định của Chrome
- Bạn có thể thay đổi thư mục lưu trong Settings của Chrome
- Extension yêu cầu quyền truy cập để tải xuống file

## Icons

Để extension hoạt động hoàn chỉnh, bạn cần thêm các icon (16x16, 48x48, 128x128 px).
Bạn có thể tạo icon đơn giản hoặc sử dụng tool online để tạo.

## Cấu trúc file

- `manifest.json` - Cấu hình extension
- `popup.html` - Giao diện popup
- `popup.js` - Logic xử lý popup
- `background.js` - Service worker xử lý download
- `README.md` - Tài liệu hướng dẫn

## Yêu cầu

- Chrome/Edge version 88 trở lên (hỗ trợ Manifest V3)

## License

MIT
