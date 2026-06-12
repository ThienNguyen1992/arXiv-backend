Đã gọn lại đúng **3 API** cho FE:

### 1. Tất cả notification (default 5)
```http
GET /notifications
Authorization: Bearer <token>
```
- Mặc định **5 item** mới nhất (`createdAt DESC`)
- Phân trang: `?page=2&size=5` nếu cần thêm

### 2. Chỉ unread (default 5)
```http
GET /notifications/unread
Authorization: Bearer <token>
```
- Mặc định **5 unread** mới nhất
- Phân trang: `?page=2&size=5`

### 3. Số unread còn lại (badge)
```http
GET /notifications/unread-count
Authorization: Bearer <token>
```
```json
{ "unreadCount": 12 }
```

**Response list** (cả `/notifications` và `/notifications/unread`):
```json
{
  "data": [ /* max 5 items */ ],
  "meta": {
    "page": 1,
    "size": 5,
    "total": 42,
    "totalPages": 9
  }
}
```

Đã bỏ `GET /notifications/all` và `?all=true` — FE chỉ cần 3 endpoint trên.