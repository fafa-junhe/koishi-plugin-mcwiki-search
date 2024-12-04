import { Context, Schema, h, Session, Logger, sleep } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import bot from "nodemw";
import { SearchResult } from 'nodemw/lib/types';
import { Browser, BrowserContext, Page } from 'puppeteer-core'
export const name = 'mcwiki-search'

export interface Config {
  viewportWidth: number
  viewportHeight: number
  timeout: number
  server: string
  path: string
  maxItem: number
}



export const Config: Schema<Config> = Schema.object({
  viewportWidth: Schema.number()
  .default(1280)
  .description("puppeteer截图时的视窗宽度，越大生成时间越长、资源占用越大。"),
  viewportHeight: Schema.number()
  .default(4000)
  .description("puppeteer截图时的视窗高度，越大生成时间越长、资源占用越大。"),
  timeout: Schema.number()
  .default(8000)
  .description("访问网页的超时时长。"),
  server: Schema.string()
  .default("wiki.biligame.com")
  .description("wiki的域名，理论上是用mediawiki搭建的站点都可以用。"),
  path: Schema.string()
  .default("/mc")
  .description("wiki的路径，例如https://wiki.biligame.com/mc/Minecraft_Wiki ，就是/mc。"),
  maxItem: Schema.number()
  .default(10)
  .description("搜索时最多显示几项。")
})

export const inject = {
  required: ['puppeteer'],
}

declare module 'koishi' {
  interface Events {
    'mcwiki-search-wait-for-input'(...args: any[]): void // 自定义事件
  }
}

var wiki_client : bot;

function getCNTime(date: Date){
  var year = date.getFullYear(); // 获取年份
  var month = date.getMonth() + 1; // 获取月份（注意加1，月份从0开始计数）
  var day = date.getDate(); // 获取日期
  var hour = date.getHours() < 10 ? "0" + date.getHours() : date.getHours(); // 获取小时
  var minute = date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes(); // 获取分钟
  var second = date.getSeconds() < 10 ? "0" + date.getSeconds() : date.getSeconds(); // 获取秒钟

  // 返回时间
  return year + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second;
}

async function look(session: Session, item: string, ctx: Context, config: Config, logger: Logger, rest: string [] = []){
  try{
    console.log(item, rest, item + (Array.isArray(rest) && rest.length ? "_" + rest.join("_") : ""));
    var url: string = await new Promise((resolve, reject) => {
      wiki_client.getArticleInfo(item + (Array.isArray(rest) && rest.length ? "_" + rest.join("_") : ""), null, (err, article) => {
        if (err){
          logger.error(err);
        }
        if (article[0].restrictiontypes.includes("create")){ // 检测页面是否未创建
          reject("未找到此网页。")
        }
        resolve(article[0].fullurl)
      })
    })
  }
  catch (err){
    return err;
  }
  var browser : Browser;
  var context : BrowserContext;
  var page : Page;
  try{
    browser = ctx.puppeteer.browser
    context = await browser.createBrowserContext()
    page = await context.newPage()
    await page.setViewport({ // 设置最大截图大小
      width: config.viewportWidth,
      height: config.viewportHeight,
      deviceScaleFactor: 1,
    })
    await page.goto(url, { // 设置超时时间
      waitUntil: 'networkidle0',
      timeout: config.timeout
    });
    await sleep(100)
    const height = await page.evaluate(() => document.querySelector(".game-bg.container").scrollHeight);
    await page.setViewport({ // 设置最大截图大小
      width: config.viewportWidth,
      height: Math.min(config.viewportHeight, height),
      deviceScaleFactor: 1,

    })
    await sleep(200);
    console.log(height, config.viewportHeight)
    if (height > config.viewportHeight){
      session.send(`由于性能问题，网页未显示完整。网页链接：${url}`)
    }else{
      session.send(`网页链接：${url}`)
    }
    var image = await page.screenshot({
      optimizeForSpeed: true,
      fromSurface: true,
      clip: {
        x: 0,
        y: 0,
        height: Math.min(config.viewportHeight, height),
        width: config.viewportWidth,
        scale: 1.0
      }

    })
  }
  catch (err){
    logger.error(err)
  }
  finally{
    await page.close();
    await context.close();
  }
  return h.image(image, 'image/png');
}

async function search(session: Session, item: string, ctx: Context, config: Config, logger: Logger, rest: string []) {
  var result: string = await new Promise((resolve) => {
    wiki_client.search(item + (Array.isArray(rest) && rest.length ? "_" + rest.join("_") : ""), (err, articles) => {
      if (err) {
        resolve("发生错误: " + err);
        return;
      }
      if (articles.length == 0){
        resolve("未找到任何文章。")
        return;
      }
      let result = "序号 标题 最后修改时间\n";
      for (let index = 0; index < Math.min(articles.length, config.maxItem); index++) {
        const article = articles[index];
        result += `${index + 1}. ${article.title} ${getCNTime(new Date(article.timestamp))}\n`;
      }
      result += articles.length > config.maxItem ? `..............\n还有${articles.length - config.maxItem}项未显示\n` : "\n"
      result += "请输入序号或者标题查看文章"
      resolve(result);
      ctx.emit('mcwiki-search-wait-for-input', articles.slice(0, config.maxItem), session)
    });
  });
  return result;
}

function is_numeric(str : string){
    return /^\d+$/.test(str); // 检测是否为数字
}

export async function apply(ctx: Context, config: Config) {
  wiki_client = new bot({
    server: config.server,
    path: config.path,
  });
  const logger = ctx.logger(`mcwiki`)
  ctx.command("mcwiki", "搜索我的世界wiki");
  ctx.command("mcwiki.search <item> [...rest]", "搜索某个关键词")
     .action(({session}, item, ...rest)=>search(session, item, ctx, config, logger, rest));
  ctx.command("mcwiki.look <item> [...rest]", "查看某个页面")
     .action(({session}, item, ...rest)=>look(session, item, ctx, config, logger, rest));
  ctx.on('mcwiki-search-wait-for-input', async (articles: SearchResult[], session: Session) => {
    var dispose;
    var timeout = setTimeout(()=>{
      session.send("输入超时，退出搜索。")
      return dispose();
    }, 10000)
    dispose = ctx.on('message', async (current_session) => {
       if (session.event.user.id === current_session.event.user.id){
         const splited = current_session.content.split(" ");
         for (const index in splited){
           if (is_numeric(splited[index].trim())){
             const num = parseInt(splited[index].trim());
             if (num > 0 && num <= Math.min(config.maxItem, articles.length)){
               clearTimeout(timeout);
               session.execute(`mcwiki.look ${articles[num - 1].title}`)
               return dispose();
             }
             else{
               session.send(`输入错误，0 < 输入范围 <= ${Math.min(config.maxItem, articles.length)}。`)
               clearTimeout(timeout);
               timeout = setTimeout(()=>{
                 session.send("输入超时，退出搜索。")
                 return dispose();
               }, 10000)
              }
            }


        }
       }
       for (var article of articles){
          if (article.title == current_session.content.trim()){
              clearTimeout(timeout);
              session.execute(`mcwiki.look ${article.title}`)
              return dispose();
            }
        }
        session.send("输入错误，退出搜索。")
        clearTimeout(timeout);
      return dispose();
    });

  })

}
