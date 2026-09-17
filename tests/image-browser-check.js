async (page) => {
  await page.goto('http://127.0.0.1:8765/');
  const fixture=await page.context().newPage();
  await fixture.setViewportSize({width:640,height:400});
  await fixture.setContent('<body style="margin:0;background:white;font:48px Arial"><div style="padding:25px">VISION CHECK 731</div><div style="margin:20px;width:100px;height:100px;background:#e11;border-radius:50%;display:inline-block"></div><div style="margin:20px;width:100px;height:100px;background:#16c;display:inline-block"></div></body>');
  const png=await fixture.screenshot({path:'output/playwright/vision-check.png'});
  await fixture.close();
  await page.locator('#settings').getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('#imageFiles').setInputFiles({name:'vision-check.png',mimeType:'image/png',buffer:png});
  await page.locator('#attachments img').waitFor();
  await page.locator('#input').fill('What text and shapes do you see?');
  await page.setViewportSize({width:390,height:844});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Mobile layout overflows');
  await page.screenshot({path:'output/playwright/vision-mobile.png'});
  await page.getByRole('button',{name:'Remove vision-check.png',exact:true}).click();
  if(await page.locator('#attachments img').count())throw Error('Attachment removal failed');
  console.log('PASS: file decoded, preview rendered, mobile layout fits, attachment removal works. No API request or credential change.');
}
