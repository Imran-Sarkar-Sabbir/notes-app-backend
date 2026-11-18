import { NotesService } from '../notes/notes.service.js';
import { PostsService } from '../posts/posts.service.js';
import { startInMemoryApp } from '../testing.js';
import { UsersService } from '../users/users.service.js';

const { app, stop } = await startInMemoryApp();
const users = app.get(UsersService);
const notes = app.get(NotesService);
const posts = app.get(PostsService);

const people = [
  {
    name: 'Admin',
    email: 'admin@demo.test',
    role: 'admin' as const,
    interests: ['coding'],
  },
  { name: 'Alice', email: 'alice@demo.test', interests: ['chess', 'reading'] },
  { name: 'Bob', email: 'bob@demo.test', interests: ['chess', 'hiking'] },
  { name: 'Carol', email: 'carol@demo.test', interests: ['reading', 'music'] },
];
for (const p of people) {
  const u = await users.create({ ...p, password: 'password123' });
  await notes.create(u._id, {
    title: `${p.name}'s first note`,
    content: 'Hello',
  });
  await posts.create(u._id, {
    title: `Hi, I'm ${p.name}`,
    body: `I like ${p.interests.join(' and ')}.`,
  });
}

const port = Number(process.env.PORT ?? 4000);
await app.listen(port);
console.log(`API on :${port} (in-memory DB, demo data loaded)`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => void stop().then(() => process.exit(0)));
}
