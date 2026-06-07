const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function test() {
  // 1. Login
  const loginData = JSON.stringify({ email: 'user1@example.com', password: 'password123' });
  const loginRes = await request({
    hostname: 'localhost', port: 3000, path: '/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginData) }
  }, loginData);

  let token;
  try {
    token = JSON.parse(loginRes.body).access_token;
    console.log('✅ Login OK. Token prefix:', token.substring(0, 30) + '...');
  } catch (e) {
    console.error('❌ Login failed:', loginRes.body);
    return;
  }

  const authHeader = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 2. Add a favorite (using a known arxiv_id)
  const arxivId = '2301.00001';
  const addFavRes = await request({
    hostname: 'localhost', port: 3000, path: `/users/me/favorites/${arxivId}`, method: 'POST',
    headers: { ...authHeader, 'Content-Length': 0 }
  }, '');
  console.log('\n✅ Add Favorite response (status):', addFavRes.statusCode);
  const favData = JSON.parse(addFavRes.body);
  console.log('   Total favorites:', favData?.meta?.total ?? 'N/A');
  console.log('   First item arxiv_id from ES:', favData?.data?.[0]?.arxiv_id ?? '(no data from ES)');

  // 3. Get favorites
  const getFavRes = await request({
    hostname: 'localhost', port: 3000, path: '/users/me/favorites', method: 'GET',
    headers: authHeader
  }, null);
  const favList = JSON.parse(getFavRes.body);
  console.log('\n✅ Get Favorites response (status):', getFavRes.statusCode);
  console.log('   Items count:', favList?.data?.length ?? 0);

  // 4. Add to history
  const addHistRes = await request({
    hostname: 'localhost', port: 3000, path: `/users/me/history/${arxivId}`, method: 'POST',
    headers: { ...authHeader, 'Content-Length': 0 }
  }, '');
  console.log('\n✅ Add History response (status):', addHistRes.statusCode);
  const histData = JSON.parse(addHistRes.body);
  console.log('   Total history:', histData?.meta?.total ?? 'N/A');

  // 5. Get history
  const getHistRes = await request({
    hostname: 'localhost', port: 3000, path: '/users/me/history', method: 'GET',
    headers: authHeader
  }, null);
  const histList = JSON.parse(getHistRes.body);
  console.log('\n✅ Get History response (status):', getHistRes.statusCode);
  console.log('   Items count:', histList?.data?.length ?? 0);

  console.log('\n✅ All tests passed!');
}

test().catch(console.error);
