# Cẩm nang & Hàm Utility Phát Hiện Trùng Lặp Bài Báo (Duplicate Detection)

Tài liệu này tổng hợp cấu trúc Pipeline 4 giai đoạn để phát hiện các bài báo (papers) trùng lặp hoặc gần giống nhau, cùng với danh sách các hàm Utility cần thiết. Cuối tài liệu là những ý tưởng nâng cao (Advanced Ideas) để mở rộng hệ thống.

---

## 1. Pipeline Phát Hiện Trùng Lặp 4 Cấp Độ (4-Stage Pipeline)

Để tối ưu hóa hiệu suất khi DB có hàng triệu bài báo, việc kiểm tra trùng lặp phải đi từ bộ lọc nhanh nhất (độ chính xác thấp) đến bộ lọc chậm nhất (độ chính xác tuyệt đối).

### Stage 1: Metadata Check (Độ phức tạp O(1) - Rất nhanh)
Sàng lọc dựa trên các thông tin văn bản thuần túy.
*   **Hàm util:** `checkMetadata(paper1, paper2)`
    *   So sánh `arXiv_id`, `DOI` (Trùng lặp chính xác - Exact Match = 100 điểm).
    *   So sánh `Title` bằng hàm `calculateStringSimilarity()` sử dụng thuật toán Levenshtein Distance (tính khoảng cách chỉnh sửa) và Jaccard (tính tỷ lệ từ vựng chung).
    *   So sánh danh sách `Authors` bằng hàm `calculateAuthorSimilarity()` (xử lý đảo ngược tên Họ - Tên).

### Stage 2: Fingerprint Check (Nhanh, dùng cho Near-duplicate)
Dùng kỹ thuật băm (hashing) để nén văn bản thành các chuỗi bit ngắn.
*   **Hàm util:** `generateSimHash(text)` / `generateMinHash(text)`
    *   Nén `Title + Abstract` thành một mã băm 64-bit.
*   **Hàm util:** `calculateHammingDistance(hash1, hash2)`
    *   Đếm số lượng bit khác nhau (Hamming Distance). Nếu khoảng cách cực nhỏ (< 3 bits), hai bài báo này có thể chỉ bị thay đổi một vài từ.

### Stage 3: Semantic Embedding (Tốc độ trung bình - Rất chính xác)
Hiểu được ý nghĩa của bài báo thay vì chỉ so sánh mặt chữ.
*   **Hàm util:** `generateEmbedding(paper)`
    *   Gọi mô hình AI (như SciBERT hoặc Sentence-Transformers) để biến Tóm tắt (Abstract) thành 1 vector số học (VD: 768 chiều).
*   **Hàm util:** `calculateCosineSimilarity(vec1, vec2)`
    *   Đo góc lệch giữa 2 vector. Hệ thống sẽ phát hiện ra sự giống nhau ngay cả khi 2 tác giả dùng cách diễn đạt hoặc từ vựng hoàn toàn khác nhau.

### Stage 4: Deep Content Check (Chậm - Dùng để thẩm định cuối cùng)
Chỉ chạy khi Stage 3 cho ra điểm số lấp lửng (từ 70% - 90%).
*   **Hàm util:** `compareAbstractsTFIDF(paper1, paper2)`: Phân tích tần suất từ vựng TF-IDF.
*   **Hàm util:** `compareReferences(paper1, paper2)`: So sánh danh sách tài liệu tham khảo (References).
*   **Hàm util:** `compareCategories(paper1, paper2)`: Đo lường mức độ trùng lặp chuyên ngành (VD: `cs.AI` và `cs.LG`).

---

## 2. Gợi Ý Thêm Các Ý Tưởng Đột Phá Để Check Duplicate

Ngoài 4 Stage truyền thống trên, dưới đây là các ý tưởng nâng cao giúp hệ thống của bạn chống đạo văn và phát hiện trùng lặp ở tầm cỡ quốc tế:

### 💡 Ý tưởng 1: Cross-Lingual Detection (Đạo văn xuyên ngôn ngữ)
Rất nhiều bài báo đạo văn bằng cách dịch nguyên bản từ tiếng Anh sang tiếng Việt, tiếng Trung, v.v.
*   **Cách làm:** Thay vì dùng SciBERT (chỉ tiếng Anh), hãy sử dụng **LaBSE** (Language-agnostic BERT Sentence Embedding) hoặc **mBERT**. Những mô hình này sẽ map câu "Học máy là gì?" và "What is Machine Learning?" vào cùng 1 tọa độ vector.
*   **Kết quả:** Hệ thống có thể báo cáo: *"Bài báo tiếng Việt này trùng lặp nội dung 95% với một bài báo tiếng Anh xuất bản năm 2021"*.

### 💡 Ý tưởng 2: Graph-based Citation Analysis (Phân tích đồ thị trích dẫn)
Một bài báo bị đổi hoàn toàn tiêu đề và tóm tắt, nhưng hệ thống vẫn bắt được sự trùng lặp.
*   **Cách làm:** So sánh "mạng lưới quan hệ" của bài báo. Nếu bài A và bài B cùng trích dẫn đúng 35 bài báo giống hệt nhau, và lại được trích dẫn bởi cùng 10 tác giả khác, xác suất rất cao đây là cùng 1 bài báo (được nộp lại ở 2 tạp chí) hoặc là một sự sao chép có chủ đích.
*   **Cấu trúc dữ liệu:** Tính Jaccard Similarity trên tập hợp (Set) của `References`.

### 💡 Ý tưởng 3: Visual/Image Hashing (Trùng lặp Hình ảnh & Biểu đồ)
Nội dung chữ có thể bị "spin" (viết lại) dễ dàng bởi ChatGPT, nhưng biểu đồ thí nghiệm (Charts, Figures) thì rất khó làm giả.
*   **Cách làm:** Giải nén file PDF, trích xuất tất cả hình ảnh bên trong bài báo. Chạy thuật toán **pHash (Perceptual Hashing)** cho từng ảnh.
*   **Kết quả:** Nếu 2 bài báo có mã pHash của các biểu đồ giống nhau, chúng ta có thể khẳng định chúng xài chung dữ liệu thí nghiệm.

### 💡 Ý tưởng 4: Locality Sensitive Hashing (LSH) cho Scale Hệ Thống
Khi có 10 triệu papers, việc lấy paper mới so sánh với 10 triệu papers cũ là bất khả thi (O(N)).
*   **Cách làm:** Dùng LSH (MinHash LSH). Thuật toán này băm dữ liệu và nhét các bài báo giống nhau vào cùng 1 "bucket" (cái xô). Khi có bài mới, ta chỉ cần băm nó ra, xem nó rơi vào xô nào, rồi chỉ so sánh với vài chục bài báo nằm sẵn trong xô đó. Tốc độ kiểm tra từ O(N) giảm xuống chỉ còn O(logN) hoặc O(1).
