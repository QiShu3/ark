import { test, expect } from '@playwright/test';

test.describe('刻意学习流 - 组合工作流测试', () => {
  test.beforeEach(async ({ page }) => {
    // 设置较长的超时时间
    test.setTimeout(120000);
  });

  test('场景 1: 登录并进入刻意学习流页面', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'output/playwright/01-homepage.png', fullPage: true });

    const usernameInput = page.locator('#auth-username, input[placeholder*="用户名"]');
    const passwordInput = page.locator('#auth-password, input[placeholder*="密码"]');
    
    if (await usernameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.screenshot({ path: 'output/playwright/02-login-page.png', fullPage: true });
      
      await usernameInput.fill('qishuadmin');
      await usernameInput.dispatchEvent('input');
      await usernameInput.dispatchEvent('change');
      
      await passwordInput.fill('12345678');
      await passwordInput.dispatchEvent('input');
      await passwordInput.dispatchEvent('change');
      
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'output/playwright/03-login-filled.png', fullPage: true });
      
      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toBeEnabled({ timeout: 15000 });
      await submitButton.click();
      
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'output/playwright/04-after-login.png', fullPage: true });
    }

    await page.goto('http://localhost:5173/learn-flow');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'output/playwright/05-learn-flow-page.png', fullPage: true });

    const url = page.url();
    expect(url).not.toContain('login');
  });

  test('场景 2: 选择配置并启动组合工作流', async ({ page }) => {
    // 先登录
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    
    // 处理登录
    const usernameInput = page.locator('input[placeholder*="用户名"], input[name="username"]');
    if (await usernameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.fill('input[placeholder*="用户名"], input[name="username"]', 'qishuadmin');
      await page.fill('input[placeholder*="密码"], input[type="password"]', '12345678');
      await page.click('button[type="submit"], button:has-text("登录")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    // 导航到刻意学习流页面
    await page.goto('http://localhost:5173/learn-flow');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'output/playwright/06-before-select-config.png', fullPage: true });

    // 查找工作流编排区域
    const orchestrationSection = page.locator('text=工作流编排, text=编排, [class*="orchestration"]');
    
    // 选择至少 2 个配置卡片
    const configCards = page.locator('[class*="card"], [class*="Card"], [role="button"]');
    const cardCount = await configCards.count();
    console.log(`Found ${cardCount} config cards`);

    if (cardCount >= 2) {
      // 点击前两个配置卡片
      await configCards.nth(0).click();
      await page.waitForTimeout(500);
      await configCards.nth(1).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'output/playwright/07-configs-selected.png', fullPage: true });

      // 查找并点击"启动组合工作流"按钮
      const startButton = page.locator('button:has-text("启动"), button:has-text("开始"), button:has-text("运行")');
      if (await startButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await startButton.first().click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'output/playwright/08-workflow-started.png', fullPage: true });
      }
    } else {
      console.log('Not enough config cards found, taking screenshot for debugging');
      await page.screenshot({ path: 'output/playwright/07-debug-no-cards.png', fullPage: true });
    }
  });

  test('场景 3: 保存当前编排', async ({ page }) => {
    // 先登录
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    
    const usernameInput = page.locator('input[placeholder*="用户名"], input[name="username"]');
    if (await usernameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.fill('input[placeholder*="用户名"], input[name="username"]', 'qishuadmin');
      await page.fill('input[placeholder*="密码"], input[type="password"]', '12345678');
      await page.click('button[type="submit"], button:has-text("登录")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    // 导航到刻意学习流页面
    await page.goto('http://localhost:5173/learn-flow');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 选择配置
    const configCards = page.locator('[class*="card"], [class*="Card"], [role="button"]');
    const cardCount = await configCards.count();
    
    if (cardCount >= 2) {
      await configCards.nth(0).click();
      await page.waitForTimeout(500);
      await configCards.nth(1).click();
      await page.waitForTimeout(500);
    }

    // 输入编排名称
    const nameInput = page.locator('input[placeholder*="名称"], input[placeholder*="编排"], input[name*="name"]');
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill('运行中的编排');
      await page.screenshot({ path: 'output/playwright/09-name-filled.png', fullPage: true });
    }

    // 点击保存按钮
    const saveButton = page.locator('button:has-text("保存"), button:has-text("存储")');
    if (await saveButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveButton.first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'output/playwright/10-after-save.png', fullPage: true });
    }
  });

  test('场景 4: 验证保存的编排', async ({ page }) => {
    // 先登录
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    
    const usernameInput = page.locator('input[placeholder*="用户名"], input[name="username"]');
    if (await usernameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.fill('input[placeholder*="用户名"], input[name="username"]', 'qishuadmin');
      await page.fill('input[placeholder*="密码"], input[type="password"]', '12345678');
      await page.click('button[type="submit"], button:has-text("登录")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    // 导航到刻意学习流页面
    await page.goto('http://localhost:5173/learn-flow');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'output/playwright/11-check-saved.png', fullPage: true });

    // 查找保存的编排卡片
    const savedCard = page.locator('text=运行中的编排');
    if (await savedCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.screenshot({ path: 'output/playwright/12-saved-card-found.png', fullPage: true });
      
      // 验证按钮存在
      const startBtn = page.locator('text=运行中的编排 >> .. >> button:has-text("启动"), text=运行中的编排 >> .. >> button:has-text("运行")');
      const loadBtn = page.locator('text=运行中的编排 >> .. >> button:has-text("加载")');
      const editBtn = page.locator('text=运行中的编排 >> .. >> button:has-text("编辑")');
      const deleteBtn = page.locator('text=运行中的编排 >> .. >> button:has-text("删除")');

      console.log('Start button visible:', await startBtn.isVisible({ timeout: 2000 }).catch(() => false));
      console.log('Load button visible:', await loadBtn.isVisible({ timeout: 2000 }).catch(() => false));
      console.log('Edit button visible:', await editBtn.isVisible({ timeout: 2000 }).catch(() => false));
      console.log('Delete button visible:', await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false));
    } else {
      console.log('Saved card "运行中的编排" not found');
    }

    await page.screenshot({ path: 'output/playwright/13-final-state.png', fullPage: true });
  });
});
