#!/bin/bash

# Danh sách các topics phổ biến trên arXiv (Các topics này sẽ được gán ngẫu nhiên cho users)
TOPICS=("cs.AI" "cs.LG" "cs.CV" "cs.NE" "math.OC" "stat.ML" "cs.DS" "cs.IT" "cs.CY" "cs.HC")

echo "Starting to import 30 users..."

for i in {1..30}; do
  EMAIL="user${i}@example.com"
  PASSWORD="password123"
  FULLNAME="Mock User ${i}"

  echo "-----------------------------------"
  echo "[$i/30] Creating user: $EMAIL"
  
  # 1. Register User
  curl -s -X POST http://localhost:3000/auth/register \
       -H "Content-Type: application/json" \
       -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\", \"full_name\": \"$FULLNAME\"}" > /dev/null

  # 2. Login to get Access Token
  LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/auth/login \
       -H "Content-Type: application/json" \
       -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")
  
  # Extract token using grep/regex
  TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

  if [ -n "$TOKEN" ]; then
    # Randomly select 2-3 topics
    T1=${TOPICS[$RANDOM % ${#TOPICS[@]}]}
    T2=${TOPICS[$RANDOM % ${#TOPICS[@]}]}
    T3=${TOPICS[$RANDOM % ${#TOPICS[@]}]}

    # Ensure unique topics in array
    JSON_TOPICS="[\"$T1\""
    if [ "$T2" != "$T1" ]; then JSON_TOPICS="$JSON_TOPICS, \"$T2\""; fi
    if [ "$T3" != "$T1" ] && [ "$T3" != "$T2" ]; then JSON_TOPICS="$JSON_TOPICS, \"$T3\""; fi
    JSON_TOPICS="$JSON_TOPICS]"

    echo "[$i/30] Setting topics $JSON_TOPICS for $EMAIL"
    
    # 3. Set Topics for User
    curl -s -X PATCH http://localhost:3000/users/me/topics \
         -H "Authorization: Bearer $TOKEN" \
         -H "Content-Type: application/json" \
         -d "{\"topic_codes\": $JSON_TOPICS}" > /dev/null
         
    echo "[$i/30] Success!"
  else
    echo "[$i/30] Failed to login and get token for $EMAIL"
    echo "Response: $LOGIN_RESPONSE"
  fi
done

echo "-----------------------------------"
echo "Done! 30 users have been created and assigned topics."
