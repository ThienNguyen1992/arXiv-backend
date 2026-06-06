# Kế hoạch Đánh Chỉ Mục (Indexing) cho Database

Để tối ưu hóa tốc độ tìm kiếm và lọc bài báo (Paper) trên tập dữ liệu hàng triệu records của arXiv, chúng ta cần thiết lập các Index chiến lược. Tài liệu này mô tả chi tiết các Index sẽ được áp dụng vào hệ thống.

## 1. Bảng Papers (`articles`)
- **`arxiv_id`**: Unique B-Tree Index. Dùng để tìm kiếm chính xác 1 bài báo và phục vụ cơ chế chống trùng lặp `ON CONFLICT DO NOTHING` khi Import.
- **`published_at` & `score`**: Composite B-Tree Index (Index tổ hợp). Tối ưu hóa cực mạnh cho câu lệnh phổ biến nhất hệ thống: *Lấy các bài báo mới nhất và có điểm đánh giá cao nhất*.
- **`status`**: B-Tree Index. Tối ưu cho việc lọc hiển thị (chỉ hiện các bài báo `published`).
- **`search_vector`**: GIN Index. Chuyên dụng cho Full-Text Search của PostgreSQL, dùng để tìm kiếm từ khóa (Keyword) cực nhanh trong Title và Abstract mà không cần dùng lệnh `LIKE '%...%'` chậm chạp.

## 2. Bảng Authors (`authors`)
- **`full_name`**: B-Tree Index. Tối ưu cho chức năng tìm kiếm bài báo dựa theo tên tác giả.

## 3. Bảng Topics (`topics`) & Categories (`categories`)
- **`code`**: Unique B-Tree Index. Phục vụ cho bộ lọc nhanh bên Sidebar (ví dụ: người dùng bấm vào danh mục `cs.AI`).

## 4. Bảng trung gian (Junction Tables)
- TypeORM mặc định tự động tạo index cho các cột khóa ngoại (Foreign Key) như `article_id`, `author_id`. Nhờ đó, việc truy vấn JOIN (Lấy danh sách tác giả của 1 bài báo) đã được tối ưu sẵn.
