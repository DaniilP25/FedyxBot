import { Bot, InlineKeyboard, InputMediaBuilder, CommandContext } from "grammy";

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { db_query } from "./db";
// ТУТ НУЖНО: ПЕРЕПИСАТЬ ДАННЫЕ ИЗ CONFIG.YAML В БД

export async function formatUnixTime(unixTime: number): Promise<string> {
  const date = new Date(unixTime * 1000);

  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = date.getUTCFullYear();
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');

  return `${day}.${month}.${year} ${hours+3}:${minutes} МСК`;
}

export async function isPremium(userId: number): Promise<[boolean, number]> {
  let checkPremium = await db_query("SELECT EXTRACT(EPOCH FROM premium AT TIME ZONE 'UTC') AS unix_time FROM CUSTOMERS WHERE id = $1", [userId]);
  let timestamp = Number(checkPremium[0]["unix_time"]);
  let now = Date.now() / 1000;
  return [timestamp > now, timestamp];
}

async function updateLimit(botToken: string): Promise<[boolean, string]> {
  const author_row = await db_query('SELECT authorid FROM APPS WHERE token = $1', [botToken]);
  const premium = await isPremium(author_row[0]['authorid']);
  
  if (premium[0] === true) {
    return [true, ''];
  } else {
    const limit_row = await db_query('SELECT weeklimit FROM APPS WHERE token = $1', [botToken]);
    const limit = limit_row[0]['weeklimit'];

    if (limit > 0) {
      await db_query('UPDATE APPS SET weeklimit = weeklimit - 1 WHERE token = $1', [botToken]);
      return [true, ''];
    } else {
      let time_row = await db_query("SELECT EXTRACT(EPOCH FROM weektimestamp AT TIME ZONE 'UTC') AS unix_timestamp FROM APPS WHERE token = $1", [botToken]);
      let time = parseInt(time_row[0]['unix_timestamp']);

      if (Date.now() / 1000 > time) {
        await db_query("UPDATE APPS SET weeklimit = 1000, weektimestamp = (NOW() + INTERVAL '7 days') AT TIME ZONE 'UTC' WHERE token = $1", [botToken]);
        time_row = await db_query("SELECT EXTRACT(EPOCH FROM weektimestamp AT TIME ZONE 'UTC') AS unix_timestamp FROM APPS WHERE token = $1", [botToken]);
        time = parseInt(time_row[0]['unix_timestamp']);
      }

      const date = await formatUnixTime(time);
      
      return [false, date];
    }
  }
}

export async function runBot(token: string) {
  let timeout_users: number[] = [];

  const fileContents = fs.readFileSync('./config.yaml', 'utf8');
  const config = yaml.load(fileContents) as {[key: string]: any};

  function sync_yaml(config: {[key: string]: any}) {
    const yamlString = yaml.dump(config);
    fs.writeFileSync('config.yaml', yamlString);
  }

  function removeTimeout(id: number): void {
    delete timeout_users[timeout_users.indexOf(id)];
  }

  const msgButtons = new InlineKeyboard()
    .text("⛔", "ban")
    .text("✅", "unban")
    .text("🗑️", "delete");

  const bot = new Bot(token);
  const ad = "\nСоздано с помощью @proposiobot."

  bot.command("start", async (ctx) => {
    let helloMessage = await db_query("SELECT helloMessage FROM APPS WHERE token = $1", [token]);
    let msg = helloMessage[0]["hellomessage"];
    const premium = await isPremium(ctx.from!.id);

    if (msg === '') { msg = config.helloMessage }
    else { msg = helloMessage[0]["hellomessage"] }
    if (premium[0] === true) { ctx.reply(msg) }
    else { ctx.reply(msg+ad) }
});

bot.on('message', async (ctx) => {
  const chatType = ctx.chat.type;

  const message = ctx.message;
  const media: any[] = [];

  // Обрабатываем фото

  if (message.photo && Array.isArray(message.photo)) {
    const firstPhoto = message.photo[0]; // Берем элемент с индексом 0
    if (firstPhoto) {
        media.push(InputMediaBuilder.photo(firstPhoto.file_id));
    }
  }

  // Обрабатываем видео
  if (message.video) {media.push(InputMediaBuilder.video(message.video.file_id))}

  if (message.video && Array.isArray(message.video)) {
      message.video.forEach(video => {
          media.push(InputMediaBuilder.video(video.file_id));
      });
  }

  // Обрабатываем аудио
  if (message.audio) {media.push(InputMediaBuilder.audio(message.audio.file_id))}

  if (message.audio && Array.isArray(message.audio)) {

      message.audio.forEach(audio => {
        media.push(InputMediaBuilder.audio(audio.file_id));
      });
  }

  // Обрабатываем документы
  if (message.document) {media.push(InputMediaBuilder.document(message.document.file_id))}

  if (message.document && Array.isArray(message.document)) {

      message.document.forEach(document => {
        media.push(InputMediaBuilder.document(document.file_id));
      });

  }

  if (message.sticker) {
    // Стикеры передаем как документы
    media.push(InputMediaBuilder.document(message.sticker.file_id));

    // Альтернативно можно использовать метод для стикеров
    // media.push(InputMediaBuilder.sticker(message.sticker.file_id));
  }    

    if (chatType === 'private') {                                        // поведение бота в лс, перенаправление текста и фото в группу, проверка на бан        
      const authorID = await db_query('SELECT authorid FROM APPS WHERE token = $1', [token]);
      if (ctx.from.id === authorID[0]['authorid']) {
        await ctx.reply(`Вы - владелец этого бота. Сюда будут приходить сообщения (или же в группу, если вы настроили эту функцию)
Если вы хотите настроить бота, то сделать это можно в @proposiobot.`);
      }

      if (config.banList.includes(ctx.from.id)) { // проверка на бан
        await ctx.reply(config.bannedMessage);
        return;
      }

      if (timeout_users.includes(ctx.from.id)) { // проверка на обоюнду
        await ctx.reply(config.timeoutMessage);
        return;
      }

      const lim = await updateLimit(token);
      if (lim[0] === false) {
          await ctx.reply(`${config.weekLimitMessage} (${lim[1]})`);
          return;
        }

      if (media.length > 0) {

        try {
          await ctx.api.sendMediaGroup(config.targetGroupId, media); // отправка вложений
        }
        catch {
          await ctx.api.sendMessage(config.targetGroupId, "У бота нет права отправлять вложения")
        }

        if (message.caption) {

          await bot.api.sendMessage(config.targetGroupId,          // отправка текста
`<b>Новое сообщение:</b> <code>${message.caption}</code>
👤 <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>
<tg-spoiler>${ctx.from.id}</tg-spoiler>`,
          {parse_mode: "HTML", reply_markup: msgButtons});

        }
        else {

          await bot.api.sendMessage(config.targetGroupId,          // отправка текста
`<b>Новое сообщение! Вложения выше</b>
👤 <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>
<tg-spoiler>${ctx.from.id}</tg-spoiler>`,
          {parse_mode: "HTML", reply_markup: msgButtons});
        }

      } else {
        if (message.text !== undefined) {
          await bot.api.sendMessage(config.targetGroupId,            // отправка текста
`<b>Новое сообщение:</b> <code>${message.text}</code>
👤 <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>
<tg-spoiler>${ctx.from.id}</tg-spoiler>`,
                      {parse_mode: "HTML", reply_markup: msgButtons});              
        }

      }

      timeout_users.push(ctx.from.id);
      setInterval(() => removeTimeout(ctx.from.id), 10000);
      await ctx.react(config.successEmoji);                        // реакция

  } else if (chatType === 'group' || chatType === 'supergroup') {    // отправка сообщений от группы в личку, выход из лишних групп

    if (ctx.chat.id == config.targetGroupId) {
        try {
          if (ctx.msg.reply_to_message == undefined) {
            return;
          }

          timeout_users.push(ctx.from.id);
          setInterval(() => removeTimeout(ctx.from.id), 10000);
          
          if (ctx.msg.reply_to_message!.from!.id == bot.botInfo.id) {
            const lim = await updateLimit(token);
            if (lim[0] === false) {
              await ctx.reply(`${config.weekLimitMessage} (${lim[1]})`);
              return;  
            }

            const id = ctx.msg.reply_to_message!.text!.split("\n").slice(-1)[0];
            const message = ctx.message; // проверено
            if (media.length > 0) {

              await ctx.api.sendMediaGroup(id, media); // отправка вложений


              if (message.caption) {

                await bot.api.sendMessage(id,          // отправка текста
`<code>${message.caption}</code>
👤 ${ctx.from.first_name}</a>`,
              {parse_mode: "HTML"});

              }
              else {

                await bot.api.sendMessage(id,          // отправка текста
`Вложения выше</b>
👤 ${ctx.from.first_name}</a>`,
              {parse_mode: "HTML"});
              }

            } else {
              if (message.text !== undefined) {
              await bot.api.sendMessage(id,            // отправка текста
`<code>${message.text}</code>
👤 ${ctx.from.first_name}`,
              {parse_mode: "HTML"});
              }
            }
            await ctx.react(config.successEmoji);                      // реакция
          }
          }


        catch (err) {
          console.log(err);
          await bot.api.sendMessage(config.targetGroupId, `<b>Ошибка:</b> <code>Отвечайте на "новое сообщение" при ответе пользователю!</code>`, {parse_mode: "HTML"});}

    }

    else {

        try {
            await ctx.api.leaveChat(ctx.chat.id);
            console.log(`Бот вышел из группы ${ctx.chat.id}`);
        }

        catch (error) {console.error(`Ошибка при выходе из группы ${ctx.chat.id}:`, error);}

    }
  }
});

bot.callbackQuery("ban", async (ctx) => {

  if (config.trustedUsers.includes(ctx.callbackQuery.from.id)) {

    const id = Number(ctx.callbackQuery.message!.text!.split("\n").slice(-1)[0]);

    if (ctx.callbackQuery.from.id === id) {
      await ctx.answerCallbackQuery({text: "Вы не можете себя заблокировать!"});
    } else if (config.banList.includes(id)) {
      await ctx.answerCallbackQuery({text: "Пользователь уже заблокирован!"});
    }
    else {
      config.banList.push(id);
      sync_yaml(config);

      await ctx.answerCallbackQuery({text: "Пользователь заблокирован"});
    }

  }
  else {await ctx.answerCallbackQuery({text: "Вы не можете управлять ботом"});}

});

bot.callbackQuery("unban", async (ctx) => {

  if (config.trustedUsers.includes(ctx.callbackQuery.from.id)) {

    const id = Number(ctx.callbackQuery.message!.text!.split("\n").slice(-1)[0]);

    if (config.banList.includes(id))  {

      delete config.banList[config.banList.indexOf(id)]
      sync_yaml(config);

      await ctx.answerCallbackQuery({text: "Пользователь разблокирован"});

    }
    else {await ctx.answerCallbackQuery({text: "Пользователь не заблокирован!"});}

  }

  else {await ctx.answerCallbackQuery({text: "Вы не можете управлять ботом"});}

});

bot.callbackQuery("delete", async (ctx) => {

  if (config.trustedUsers.includes(ctx.callbackQuery.from.id)) {

    await ctx.api.editMessageText(ctx.chat!.id, ctx.msgId!, `<i>👤 <a href="tg://user?id=${ctx.callbackQuery.from.id}">${ctx.callbackQuery.from.first_name}</a> удалил сообщение.</i>`, {parse_mode: "HTML"});
    await ctx.answerCallbackQuery({text: "Сообщение удалено"});

  }
  else {await ctx.answerCallbackQuery({text: "Вы не можете управлять ботом"});}

});
  bot.start();
}