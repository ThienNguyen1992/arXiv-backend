const http = require('http');

const TOPICS = ["cs.AI", "cs.LG", "cs.CV", "cs.NE", "math.OC", "stat.ML", "cs.DS", "cs.IT", "cs.CY", "cs.HC"];

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body });
      });
    });

    req.on('error', error => reject(error));

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function run() {
  console.log("Starting to import 30 users...");

  for (let i = 1; i <= 30; i++) {
    const email = `user${i}@example.com`;
    const password = "password123";
    const fullName = `Mock User ${i}`;

    console.log("-----------------------------------");
    console.log(`[${i}/30] Creating user: ${email}`);

    // 1. Register User
    const registerData = JSON.stringify({ email, password, full_name: fullName });
    await request({
      hostname: 'localhost',
      port: 3000,
      path: '/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(registerData)
      }
    }, registerData);

    // 2. Login to get Access Token
    const loginData = JSON.stringify({ email, password });
    const loginResponse = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      }
    }, loginData);

    let token = null;
    try {
      const parsed = JSON.parse(loginResponse.body);
      token = parsed.access_token;
    } catch (e) {
      // ignore
    }

    if (token) {
      // Randomly select 2-3 topics
      const numTopics = Math.floor(Math.random() * 2) + 2; // 2 or 3
      const shuffledTopics = [...TOPICS].sort(() => 0.5 - Math.random());
      const selectedTopics = shuffledTopics.slice(0, numTopics);

      console.log(`[${i}/30] Setting topics ${JSON.stringify(selectedTopics)} for ${email}`);

      // 3. Set Topics for User
      const topicsData = JSON.stringify({ topic_codes: selectedTopics });
      await request({
        hostname: 'localhost',
        port: 3000,
        path: '/users/me/topics',
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(topicsData)
        }
      }, topicsData);

      console.log(`[${i}/30] Success!`);
    } else {
      console.log(`[${i}/30] Failed to login and get token for ${email}`);
      console.log(`Response: ${loginResponse.body}`);
    }
  }

  console.log("-----------------------------------");
  console.log("Done! 30 users have been created and assigned topics.");
}

run().catch(console.error);
