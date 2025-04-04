// import { saveData, loadData } from './data';

// const dynamicData = {
//   name: 'John',
//   age: 30,
// };

// saveData(dynamicData).then(() => {
//   loadData().then((data) => console.log(data));
// });

import { Bot, InlineKeyboard, InputMediaBuilder } from "grammy";
import { InputMediaPhoto, InputMediaVideo, InputMediaDocument, InputMediaAudio } from '@grammyjs/types';

import * as fs from 'fs';
import * as yaml from 'js-yaml';

const fileContents = fs.readFileSync('./config.yaml', 'utf8');
const config = yaml.load(fileContents) as {[key: string]: any};
const bot = new Bot(config.token);

function sync_yaml(config: {[key: string]: any}) {
  const yamlString = yaml.dump(config);
  fs.writeFileSync('config.yaml', yamlString);
}

const msgButtons = new InlineKeyboard()                    // кнопки бан разбан удалить
  .text("⛔", "ban")
  .text("✅", "unban")
  .text("🗑️", "delete");

// bot.on("message", async (ctx) => {
//     await ctx.reply(ctx.message.text!);
// });

bot.command("start", async (ctx) => {                      // /start
    await ctx.reply(config.helloMessage);
});

// хуйня с оплатой
// bot.command("buy", async (ctx) => {
//   try {
//       const invoiceLink = await bot.api.createInvoiceLink(
//           "деф",
//           "приобрести дефа без регистрации и налогов",
//           "{}",
//           "1744374395:TEST:781426a4c1472b6b1ee6", // Токен платежного провайдера
//           "RUB",
//           [{amount: 10000, label: "деф"}]
//       );
//       await ctx.reply(`${invoiceLink}`);
//   } catch (error) {
//       console.error("Ошибка генерации инвойса:", error);
//   }
// });

// bot.on("pre_checkout_query", async (ctx) => {
//   try {
//       await ctx.answerPreCheckoutQuery(true); // Подтверждение оплаты
//   } catch (error) {
//       console.error("Ошибка обработки pre_checkout_query:", error);
//   }
// });

// bot.on("message:successful_payment", async (ctx) => {
//   try {
//       await ctx.reply("Оплата успешно завершена!");
//   } catch (error) {
//       console.error("Ошибка обработки успешной оплаты:", error);
//   }
// });


bot.on('message', async (ctx) => {
    const chatType = ctx.chat.type;

    if (chatType === 'private') {                                        // поведение бота в лс, перенаправление текста и фото в группу, проверка на бан

        if (config.banList.includes(ctx.from.id)) { // проверка на бан
          ctx.reply(config.bannedMessage);
          return;
        }

        const message = ctx.message;
        const media: any[] = [];

        // Обрабатываем фото
        if (message.photo && Array.isArray(message.photo)) {
            message.photo.forEach(photo => {
              media.push(InputMediaBuilder.photo(photo.file_id));
            });
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

        if (media.length > 0) {

          await ctx.api.sendMediaGroup(config.targetGroupId, media);

          if (message.caption) {

            await bot.api.sendMessage(config.targetGroupId,
`<b>Новое сообщение:</b> <code>${message.caption}</code>
👤 <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>
<tg-spoiler>${ctx.from.id}</tg-spoiler>`,
            {parse_mode: "HTML", reply_markup: msgButtons})

          }
          else {

            await bot.api.sendMessage(config.targetGroupId,
`<b>Новое сообщение! Вложения выше</b>
👤 <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>
<tg-spoiler>${ctx.from.id}</tg-spoiler>`,
            {parse_mode: "HTML", reply_markup: msgButtons})
          }

        } else {

          await bot.api.sendMessage(config.targetGroupId,
`<b>Новое сообщение:</b> <code>${message.text}</code>
👤 <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>
<tg-spoiler>${ctx.from.id}</tg-spoiler>`,
          {parse_mode: "HTML", reply_markup: msgButtons})
        }

        await ctx.react(config.successEmoji);


  } else if (chatType === 'group' || chatType === 'supergroup') {

        if (ctx.chat.id == config.targetGroupId) {

            try {

                const id = ctx.msg.reply_to_message!.text!.split("\n").slice(-1)[0];
                const message = ctx.message.text!;
                await bot.api.sendMessage(id,
`<b>${message}</b>\n
👤 ${ctx.from.first_name}`,
                {parse_mode: "HTML"});

            }

            catch (err) {await bot.api.sendMessage(config.targetGroupId, `<b>Ошибка:</b> <code>${String(err)}</code>`, {parse_mode: "HTML"});}
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

    if (config.banList.includes(id)) {
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