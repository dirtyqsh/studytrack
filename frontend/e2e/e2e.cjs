// Сквозные проверки в браузере (Playwright). Нужны запущенные backend и frontend с демо-данными (python -m app.seed).
// Запуск: npx playwright install chromium && npm run e2e   (адрес — переменная BASE_URL, по умолчанию http://127.0.0.1:5173)
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const shots = __dirname + '/shots/';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const step = async (name, fn) => { try { await fn(); console.log('OK  ', name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); await page.screenshot({ path: shots + 'fail-' + name.replace(/\W+/g,'_') + '.png' }); } };

  await step('redirect to login', async () => {
    await page.goto(BASE + '/board');
    await page.waitForURL('**/login');
  });
  await step('wrong password', async () => {
    await page.fill('#email', 'demo@studytrack.ru');
    await page.fill('#password', 'wrong-pass');
    await page.click('button[type=submit]');
    await page.getByText('Неверный e-mail или пароль').waitFor();
    await page.screenshot({ path: shots + '01-login.png' });
  });
  await step('login', async () => {
    await page.fill('#password', 'demo12345');
    await page.click('button[type=submit]');
    await page.waitForURL(BASE + '/');
    await page.getByText('Прогресс по дисциплинам').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shots + '02-dashboard.png', fullPage: true });
  });
  await step('board', async () => {
    await page.click('a[href="/board"]');
    await page.getByRole('heading', { name: 'Доска задач' }).waitFor();
    await page.locator('.card').first().waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shots + '03-board.png', fullPage: true });
  });
  await step('drag todo -> in_progress', async () => {
    const card = page.locator('section[aria-label="Нужно сделать"] .card').first();
    const title = (await card.locator('.card-title').innerText()).trim();
    const target = page.locator('section[aria-label="В работе"] .column-body');
    const a = await card.boundingBox(); const b = await target.boundingBox();
    await page.mouse.move(a.x + 40, a.y + 20); await page.mouse.down();
    await page.mouse.move(a.x + 60, a.y + 30, { steps: 5 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 10, { steps: 20 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(800);
    const inProgress = await page.locator('section[aria-label="В работе"] .card-title').allInnerTexts();
    if (!inProgress.map(s => s.trim()).includes(title)) throw new Error('card not moved: ' + title);
    await page.reload();
    await page.locator('.card').first().waitFor();
    const after = await page.locator('section[aria-label="В работе"] .card-title').allInnerTexts();
    if (!after.map(s => s.trim()).includes(title)) throw new Error('not persisted');
    console.log('     moved:', title);
  });
  await step('board filter by course', async () => {
    const chips = page.locator('.filters .chip-btn');
    await chips.nth(1).click();
    await page.waitForTimeout(200);
    const shown = await page.locator('.card').count();
    await chips.nth(0).click();
    const all = await page.locator('.card').count();
    if (!(shown < all)) throw new Error(`filter ${shown}/${all}`);
  });
  await step('quick add', async () => {
    await page.getByRole('button', { name: 'Добавить задачу' }).click();
    await page.fill('#quick-title', 'Тест: быстрая задача');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await page.getByText('Тест: быстрая задача').waitFor();
  });
  await step('task modal edit + checklist', async () => {
    await page.getByText('Тест: быстрая задача').click();
    await page.locator('.modal').waitFor();
    await page.fill('#new-item', 'Пункт один');
    await page.keyboard.press('Enter');
    await page.getByText('Пункт один').waitFor();
    await page.fill('#new-item', 'Пункт два');
    await page.keyboard.press('Enter');
    await page.getByText('Пункт два').waitFor();
    await page.locator('.subtask input[type=checkbox]').first().check();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shots + '04-task-modal.png' });
    // typing must keep focus inside input
    await page.locator('#task-title').click();
    await page.keyboard.type(' (ред.)');
    const val = await page.inputValue('#task-title');
    if (!val.endsWith('(ред.)')) throw new Error('focus lost while typing: ' + val);
    await page.click('button[type=submit][form=task-form]');
    await page.waitForTimeout(500);
  });
  await step('grade only when done', async () => {
    await page.getByText('Тест: быстрая задача (ред.)').first().click();
    await page.locator('.modal').waitFor();
    const disabled = await page.locator('#task-grade').isDisabled();
    if (!disabled) throw new Error('grade enabled for todo');
    await page.keyboard.press('Escape');
  });
  await step('list + search', async () => {
    await page.click('a[href="/tasks"]');
    await page.getByRole('heading', { name: 'Список задач' }).waitFor();
    await page.locator('tbody tr').first().waitFor();
    await page.screenshot({ path: shots + '05-list.png', fullPage: true });
    await page.fill('#list-search', 'быстрая');
    await page.waitForTimeout(900);
    const rows = await page.locator('tbody tr').count();
    if (rows !== 1) throw new Error('search rows ' + rows);
    if (!page.url().includes('q=')) throw new Error('url not synced');
    await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Срок/ }).click();
    await page.waitForTimeout(400);
    if (!page.url().includes('order=desc')) throw new Error('sort not toggled ' + page.url());
  });
  await step('overdue filter', async () => {
    await page.getByRole('button', { name: 'Просроченные' }).click();
    await page.waitForTimeout(500);
    const n = await page.locator('tbody tr').count();
    const od = await page.locator('tbody tr.row-overdue').count();
    if (n !== od) throw new Error(`overdue ${od}/${n}`);
    console.log('     overdue rows:', n);
  });
  await step('calendar', async () => {
    await page.click('a[href="/calendar"]');
    await page.getByRole('heading', { name: 'Календарь' }).waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({ path: shots + '06-calendar.png', fullPage: true });
  });
  await step('calendar drag', async () => {
    let chip = page.locator('.cal-day:not(.cal-outside) .cal-chip').first();
    if (await chip.count() === 0) { await page.getByLabel('Вперёд').click(); await page.waitForTimeout(600); chip = page.locator('.cal-day .cal-chip').first(); }
    const title = await chip.getAttribute('title');
    const dayFrom = await chip.locator('xpath=ancestor::div[contains(@class,"cal-day")][1]').getAttribute('aria-label');
    const days = page.locator('.cal-day');
    const cnt = await days.count();
    let target = null, targetKey = null;
    for (let i = 0; i < cnt; i++) { const k = await days.nth(i).getAttribute('aria-label'); if (k !== dayFrom && (await days.nth(i).locator('.cal-chip').count()) === 0) { target = days.nth(i); targetKey = k; break; } }
    const a = await chip.boundingBox(); const b = await target.boundingBox();
    await page.mouse.move(a.x + 20, a.y + 8); await page.mouse.down();
    await page.mouse.move(a.x + 40, a.y + 20, { steps: 5 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
    await page.mouse.up();
    await page.getByText('перенесён').waitFor();
    await page.waitForTimeout(500);
    const moved = await page.locator(`.cal-day[aria-label="${targetKey}"] .cal-chip`).count();
    if (moved !== 1) throw new Error('chip not in target');
    console.log('     ', title, dayFrom, '->', targetKey);
  });
  await step('calendar week', async () => {
    await page.getByRole('button', { name: 'Неделя' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shots + '07-calendar-week.png' });
    await page.getByRole('button', { name: 'Месяц' }).click();
  });
  await step('courses', async () => {
    await page.click('a[href="/courses"]');
    await page.getByRole('heading', { name: 'Дисциплины', exact: true }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shots + '08-courses.png', fullPage: true });
  });
  await step('course create + delete with tasks warning', async () => {
    await page.getByRole('button', { name: 'Дисциплина', exact: true }).click();
    await page.fill('#course-title', 'Тестовая дисциплина');
    await page.click('button[form=course-form]');
    await page.getByRole('heading', { name: 'Тестовая дисциплина' }).waitFor();
    await page.getByLabel('Удалить дисциплину Тестовая дисциплина').click();
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    await page.getByText('Дисциплина удалена').waitFor();
    // with tasks: first course of demo
    const del = page.locator('[aria-label^="Удалить дисциплину"]').first();
    await del.click();
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить вместе с задачами' }).waitFor();
    await page.screenshot({ path: shots + '09-course-delete-warning.png' });
    await page.getByRole('button', { name: 'Отмена' }).click();
  });
  await step('archived semester read-only', async () => {
    await page.selectOption('#semester-select', { label: 'Весна 2026 (архив)' }).catch(async () => {
      const opts = await page.locator('#semester-select option').allInnerTexts(); throw new Error('opts ' + opts.join('|'));
    });
    await page.getByText('только для чтения').first().waitFor();
    const disabled = await page.getByRole('button', { name: /Задача/ }).first().isDisabled();
    if (!disabled) throw new Error('create enabled in archive');
    await page.click('a[href="/board"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: shots + '10-archive.png' });
    await page.selectOption('#semester-select', { label: 'Осень 2026' }).catch(()=>{});
    await page.waitForTimeout(500);
  });
  await step('notifications', async () => {
    await page.getByRole('button', { name: /Уведомления/ }).click();
    await page.locator('.dropdown').waitFor();
    await page.screenshot({ path: shots + '11-notifications.png' });
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 600 } });
  });
  await step('profile', async () => {
    await page.click('a[href="/profile"]');
    await page.getByRole('heading', { name: 'Профиль' }).waitFor();
    await page.screenshot({ path: shots + '12-profile.png', fullPage: true });
    await page.fill('#pwd-current', 'badpass1');
    await page.fill('#pwd-next', 'newpass123');
    await page.fill('#pwd-repeat', 'newpass123');
    await page.getByRole('button', { name: 'Изменить пароль' }).click();
    await page.locator('.error-text').first().waitFor();
  });
  await step('mobile', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('a[href="/"]');
    await page.getByText('Прогресс по дисциплинам').waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shots + '13-mobile-dashboard.png', fullPage: true });
    await page.click('a[href="/board"]');
    await page.locator('.card').first().waitFor();
    await page.screenshot({ path: shots + '14-mobile-board.png' });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.click('a[href="/calendar"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: shots + '15-tablet-calendar.png' });
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await step('logout', async () => {
    await page.click('a[href="/profile"]');
    await page.getByRole('button', { name: 'Выйти' }).click();
    await page.waitForURL('**/login');
  });
  console.log('console errors:', errors.length ? errors : 'none');
  await browser.close();
})();
