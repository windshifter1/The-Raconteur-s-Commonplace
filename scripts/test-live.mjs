const key = 'sb_publishable_vIh-4HVNRuKbYZgZl-SPng_Nc7jfCPM';
const base = 'https://joctuzargvajerqwxuvn.supabase.co/functions/v1/catalogue';

async function probe(label, url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log(`\n=== ${label} (${res.status}) ===`);
    console.log('Left Hand:', /Left Hand of Darkness/.test(text));
    console.log('Search form:', /name="q"/.test(text));
    console.log('Script tag:', /<script/i.test(text));
    console.log('Module script:', /type="module"/.test(text));
    console.log('Error page:', /Function not found|401|Missing/i.test(text) ? text.slice(0, 200) : 'none');
    return { ok: res.ok, text };
  } catch (err) {
    console.log(`\n=== ${label} FAIL ===`);
    console.log(err.message);
    return { ok: false };
  }
}

const catalogue = `${base}?apikey=${encodeURIComponent(key)}&view=catalogue`;
const search = `${base}?apikey=${encodeURIComponent(key)}&view=catalogue&q=${encodeURIComponent('Le Guin')}`;
const addBook = `${base}?apikey=${encodeURIComponent(key)}&view=add-book`;

await probe('Catalogue', catalogue);
const searchRes = await probe('Search Le Guin', search);
if (searchRes.text) {
  console.log('Search has Le Guin:', (searchRes.text.match(/Le Guin/g) || []).length);
  console.log('Search hides Station Eleven:', !/Station Eleven/.test(searchRes.text));
}
await probe('Add book form', addBook);

const pages = await fetch('https://windshifter1.github.io/The-Raconteur-s-Commonplace/');
const pagesText = await pages.text();
console.log('\n=== GitHub Pages ===');
console.log('Status', pages.status);
console.log('Raconteur', /Raconteur/.test(pagesText));
console.log('Vite bundle', /assets\/index-.*\.js/.test(pagesText));
console.log('Plain HTML footer', /No scripts/.test(pagesText));
