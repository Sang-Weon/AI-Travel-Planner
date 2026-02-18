import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

// 빌드된 파일이 저장되는 dist 폴더를 지정합니다.
app.use(express.static(path.join(__dirname, 'dist')));

// 모든 경로에서 index.html을 반환하도록 설정 (404 방지)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
