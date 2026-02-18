import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const distPath = path.join(__dirname, 'dist');

// dist 폴더 존재 여부 체크 (디버깅용)
if (!fs.existsSync(distPath)) {
  console.error("Critical Error: 'dist' folder not found. Ensure 'npm run build' was executed.");
}

app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is proactively listening on port ${PORT}`);
});
