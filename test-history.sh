EMAIL="test-$(date +%s)@example.com"
curl -s -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"password\",\"name\":\"Test\"}" > /dev/null
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"password\"}" | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')

echo "Adding history..."
curl -s -X POST http://localhost:3000/users/me/history/0704.0001 -H "Authorization: Bearer $TOKEN"

echo -e "\nGetting history..."
curl -s -X GET "http://localhost:3000/users/me/history?page=1&size=20" -H "Authorization: Bearer $TOKEN"

