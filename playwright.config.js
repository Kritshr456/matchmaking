import { defineConfig } from '@playwright/test';
const baseURL=`http://127.0.0.1:${Number(process.env.BROWSER_TEST_PORT||4187)}`;
export default defineConfig({
 testDir:'./e2e',workers:1,timeout:30000,
 use:{baseURL,headless:true,trace:'retain-on-failure',screenshot:'only-on-failure',
  launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}},
 webServer:{command:'node scripts/browser-server.js',url:baseURL+'/health',reuseExistingServer:false,timeout:15000},
});
