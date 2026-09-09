import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('directly opened dashboard explains that the Localship server is required', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.match(html, /id="direct-file-warning"/);
  assert.match(html, /npm start/);
  assert.match(html, /location\.protocol === 'file:'/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /data-src="\.\/app\.js"/);
});

test('dashboard provides explicit project lifecycle controls and delete confirmation', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(html, /id="delete-project-dialog"/);
  assert.match(html, /name="confirmName"/);
  assert.match(html, /name="deleteStorage"/);
  assert.match(script, /data-pause=/);
  assert.match(script, /data-resume=/);
  assert.match(script, /data-terminate=/);
  assert.match(script, /data-delete-project=/);
});
