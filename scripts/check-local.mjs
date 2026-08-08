const res = await fetch('http://localhost:5174/');
const text = await res.text();
console.log('status', res.status);
console.log('title', text.match(/<title>(.*?)<\/title>/)?.[1] ?? 'none');
