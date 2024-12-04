var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(src_exports);
var import_koishi = require("koishi");
var import_nodemw = __toESM(require("nodemw"));
var name = "mcwiki-search";
var Config = import_koishi.Schema.object({
  viewportWidth: import_koishi.Schema.number().default(1280).description("puppeteer截图时的视窗宽度，越大生成时间越长、资源占用越大。"),
  viewportHeight: import_koishi.Schema.number().default(4e3).description("puppeteer截图时的视窗高度，越大生成时间越长、资源占用越大。"),
  timeout: import_koishi.Schema.number().default(8e3).description("访问网页的超时时长。"),
  server: import_koishi.Schema.string().default("wiki.biligame.com").description("wiki的域名，理论上是用mediawiki搭建的站点都可以用。"),
  path: import_koishi.Schema.string().default("/mc").description("wiki的路径，例如https://wiki.biligame.com/mc/Minecraft_Wiki ，就是/mc。"),
  maxItem: import_koishi.Schema.number().default(10).description("搜索时最多显示几项。")
});
var inject = {
  required: ["puppeteer"]
};
var wiki_client;
function getCNTime(date) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();
  var hour = date.getHours() < 10 ? "0" + date.getHours() : date.getHours();
  var minute = date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes();
  var second = date.getSeconds() < 10 ? "0" + date.getSeconds() : date.getSeconds();
  return year + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second;
}
__name(getCNTime, "getCNTime");
async function look(session, item, ctx, config, logger, rest = []) {
  try {
    console.log(item, rest, item + (Array.isArray(rest) && rest.length ? "_" + rest.join("_") : ""));
    var url = await new Promise((resolve, reject) => {
      wiki_client.getArticleInfo(item + (Array.isArray(rest) && rest.length ? "_" + rest.join("_") : ""), null, (err, article) => {
        if (err) {
          logger.error(err);
        }
        if (article[0].restrictiontypes.includes("create")) {
          reject("未找到此网页。");
        }
        resolve(article[0].fullurl);
      });
    });
  } catch (err) {
    return err;
  }
  var browser;
  var context;
  var page;
  try {
    browser = ctx.puppeteer.browser;
    context = await browser.createBrowserContext();
    page = await context.newPage();
    await page.setViewport({
      // 设置最大截图大小
      width: config.viewportWidth,
      height: config.viewportHeight,
      deviceScaleFactor: 1
    });
    await page.goto(url, {
      // 设置超时时间
      waitUntil: "networkidle0",
      timeout: config.timeout
    });
    await (0, import_koishi.sleep)(100);
    const height = await page.evaluate(() => document.querySelector(".game-bg.container").scrollHeight);
    await page.setViewport({
      // 设置最大截图大小
      width: config.viewportWidth,
      height: Math.min(config.viewportHeight, height),
      deviceScaleFactor: 1
    });
    await (0, import_koishi.sleep)(200);
    console.log(height, config.viewportHeight);
    if (height > config.viewportHeight) {
      session.send(`由于性能问题，网页未显示完整。网页链接：${url}`);
    } else {
      session.send(`网页链接：${url}`);
    }
    var image = await page.screenshot({
      optimizeForSpeed: true,
      fromSurface: true,
      clip: {
        x: 0,
        y: 0,
        height: Math.min(config.viewportHeight, height),
        width: config.viewportWidth,
        scale: 1
      }
    });
  } catch (err) {
    logger.error(err);
  } finally {
    await page.close();
    await context.close();
  }
  return import_koishi.h.image(image, "image/png");
}
__name(look, "look");
async function search(session, item, ctx, config, logger, rest) {
  var result = await new Promise((resolve) => {
    wiki_client.search(item + (Array.isArray(rest) && rest.length ? "_" + rest.join("_") : ""), (err, articles) => {
      if (err) {
        resolve("发生错误: " + err);
        return;
      }
      if (articles.length == 0) {
        resolve("未找到任何文章。");
        return;
      }
      let result2 = "序号 标题 最后修改时间\n";
      for (let index = 0; index < Math.min(articles.length, config.maxItem); index++) {
        const article = articles[index];
        result2 += `${index + 1}. ${article.title} ${getCNTime(new Date(article.timestamp))}
`;
      }
      result2 += articles.length > config.maxItem ? `..............
还有${articles.length - config.maxItem}项未显示
` : "\n";
      result2 += "请输入序号或者标题查看文章";
      resolve(result2);
      ctx.emit("mcwiki-search-wait-for-input", articles.slice(0, config.maxItem), session);
    });
  });
  return result;
}
__name(search, "search");
function is_numeric(str) {
  return /^\d+$/.test(str);
}
__name(is_numeric, "is_numeric");
async function apply(ctx, config) {
  wiki_client = new import_nodemw.default({
    server: config.server,
    path: config.path
  });
  const logger = ctx.logger(`mcwiki`);
  ctx.command("mcwiki", "搜索我的世界wiki");
  ctx.command("mcwiki.search <item> [...rest]", "搜索某个关键词").action(({ session }, item, ...rest) => search(session, item, ctx, config, logger, rest));
  ctx.command("mcwiki.look <item> [...rest]", "查看某个页面").action(({ session }, item, ...rest) => look(session, item, ctx, config, logger, rest));
  ctx.on("mcwiki-search-wait-for-input", async (articles, session) => {
    var dispose;
    var timeout = setTimeout(() => {
      session.send("输入超时，退出搜索。");
      return dispose();
    }, 1e4);
    dispose = ctx.on("message", async (current_session) => {
      if (session.event.user.id === current_session.event.user.id) {
        const splited = current_session.content.split(" ");
        for (const index in splited) {
          if (is_numeric(splited[index].trim())) {
            const num = parseInt(splited[index].trim());
            if (num > 0 && num <= Math.min(config.maxItem, articles.length)) {
              clearTimeout(timeout);
              session.execute(`mcwiki.look ${articles[num - 1].title}`);
              return dispose();
            } else {
              session.send(`输入错误，0 < 输入范围 <= ${Math.min(config.maxItem, articles.length)}。`);
              clearTimeout(timeout);
              timeout = setTimeout(() => {
                session.send("输入超时，退出搜索。");
                return dispose();
              }, 1e4);
            }
          }
        }
      }
      for (var article of articles) {
        if (article.title == current_session.content.trim()) {
          clearTimeout(timeout);
          session.execute(`mcwiki.look ${article.title}`);
          return dispose();
        }
      }
      session.send("输入错误，退出搜索。");
      clearTimeout(timeout);
      return dispose();
    });
  });
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name
});
