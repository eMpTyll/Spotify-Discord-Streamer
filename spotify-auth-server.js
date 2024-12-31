const express = require('express');
const fs = require('fs');
const app = express();

app.get('/callback', (req, res) => {
  const code = req.query.code;
  console.log('Authorization code:', code);
  
  // Lưu code vào file
  fs.writeFileSync('spotify-auth-code.txt', code);
  console.log('Code đã được lưu vào file spotify-auth-code.txt');
  
  res.send('Xác thực thành công! Bạn có thể đóng cửa sổ này.');
});

app.listen(8888, () => {
  console.log('Server đang chạy tại port 8888');
});
