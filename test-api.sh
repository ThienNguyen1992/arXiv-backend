EMAIL="test-$(date +%s)@example.com"
echo "Registering $EMAIL..."
curl -s -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"password\",\"name\":\"Test\"}" > /dev/null

echo "Logging in..."
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"password\"}" | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')

echo "Adding favorite..."
curl -s -X POST http://localhost:3000/users/me/favorites/0704.0001 -H "Authorization: Bearer $TOKEN"

echo -e "\nGetting favorites..."
curl -s -X GET "http://localhost:3000/users/me/favorites?page=1&size=20" -H "Authorization: Bearer $TOKEN"

