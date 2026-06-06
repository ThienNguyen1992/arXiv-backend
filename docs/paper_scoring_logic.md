# Thuật toán tính điểm số Paper (Paper Scoring Algorithm)

Đây là tài liệu giải thích logic tính điểm (score) nâng cao cho mỗi bài báo (paper). Thuật toán này sử dụng mô hình trọng số đa chiều (multi-metric weighted model) để đánh giá toàn diện chất lượng của một bài báo khoa học.

## 1. Mô hình tính điểm tổng hợp

### **Formula tổng quát:**
```
Paper_Score = w1×Citation_Score + w2×Recency_Score + w3×Author_Score + 
              w4×Engagement_Score + w5×Quality_Score
```

Với trọng số mặc định: `w1(35%) + w2(20%) + w3(20%) + w4(15%) + w5(10%) = 100%`

---

## 2. Chi tiết từng thành phần

### **A. Citation Score (35%)**
Đo lường mức độ ảnh hưởng dựa trên số lượng trích dẫn (citations).
- Tính toán dựa trên số lượng citation chuẩn hóa theo số tuổi của bài báo (citations per year).
- Điểm này phản ánh mức độ lan truyền và sự công nhận của cộng đồng học thuật đối với nghiên cứu.

### **B. Recency Score (20%)**
Papers mới hơn sẽ được ưu tiên để đảm bảo tính thời sự.
- Áp dụng hàm suy giảm theo cấp số nhân (Exponential decay) với half-life là 2 năm (730 ngày).
- Có điểm cộng (bonus) nếu bài báo được cập nhật gần đây (qua các version mới).

### **C. Author Score (20%)**
Đo lường uy tín của (các) tác giả bài báo.
- Dựa trên h-index, tổng số citations, năng suất (số lượng bài báo) và mức độ hợp tác (số lượng co-authors khác biệt) của tác giả.
- Lấy điểm trung bình của top 3 tác giả xuất sắc nhất trong bài báo.

### **D. Engagement Score (15%)**
Đo lường sự tương tác thực tế của cộng đồng trên nền tảng.
- Tổng hợp từ số lượt xem (views), lượt tải (downloads), lượt lưu (bookmarks), và số lượng bình luận (comments).
- Có điểm thưởng cho tỷ lệ chuyển đổi (Download/View ratio) cho thấy người dùng thực sự quan tâm sau khi đọc tiêu đề/tóm tắt.

### **E. Quality Score (10%)**
Đánh giá chất lượng nội dung và hình thức trình bày.
- Điểm đánh giá nơi xuất bản (Venue ranking): ví dụ NeurIPS, CVPR, Nature, Science...
- Độ dài và chất lượng của Abstract (150-300 từ là tối ưu).
- Điểm thưởng nếu bài báo có đính kèm mã nguồn (Code) hoặc tập dữ liệu (Dataset).
- Việc tác giả phát hành nhiều version cũng chứng tỏ sự chăm chút và hoàn thiện bài báo.

---

## 3. Hệ thống Phạt (Penalties) & Phân hạng (Ranking)

Sau khi tính tổng điểm, thuật toán có áp dụng các hình phạt để giảm thiểu các bài báo kém chất lượng:
- **Phạt 30% (-30%)** cho các bài báo đã ra mắt hơn 3 năm mà không có ai trích dẫn.
- **Phạt 20% (-20%)** cho các bài báo không có Abstract hoặc Abstract quá ngắn.
- **Phạt 10% (-10%)** cho các bài báo khoa học (đặc biệt ngành AI/ML) chỉ có 1 tác giả duy nhất (ít sự cộng tác).

### **Phân Hạng Điểm (Ranking):**
Dựa trên điểm số cuối cùng (0-100), bài báo được xếp hạng:
- **Excellent:** >= 80 điểm
- **Very Good:** >= 65 điểm
- **Good:** >= 50 điểm
- **Average:** >= 35 điểm
- **Below Average:** < 35 điểm

---

## 4. Tùy chỉnh trọng số theo Use-case
Thuật toán cho phép ghi đè `weights` để phục vụ các ngữ cảnh khác nhau:
- **Trending Papers:** Tăng trọng số `recency` (40%) và `engagement` (20%).
- **Classic Papers:** Tăng cực đại trọng số `citation` (50%) và `author` (25%).

Code TypeScript triển khai thuật toán này được đặt tại: `src/common/utils/paper-score.util.ts`.
