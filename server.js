import express from 'express';
import { createServer } from 'node:http';
import { join } from 'node:path';

const app = express();
const server = createServer(app);

// 静的ファイルの配信
app.use(express.static(join(process.cwd(), 'public')));

// どこにも当てはまらない場合は404（またはindex.html）
app.use((req, res) => {
    res.status(404).send('404 Not Found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`SenninProxy is flying at http://localhost:${PORT}`);
});
