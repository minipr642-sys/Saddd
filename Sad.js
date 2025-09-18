// index.js

import TelegramBot from "node-telegram-bot-api";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";

// Load Bot Token from environment
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing. Set it in Render environment variables.");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// In-memory wallet store { userId: Keypair }
const wallets = {};

// Solana connections
const connections = {
  devnet: new Connection(clusterApiUrl("devnet"), "confirmed"),
  mainnet: new Connection(clusterApiUrl("mainnet-beta"), "confirmed"),
};

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "👋 Welcome to *Solana Balance Checker Bot*!\n\n⚡ Import your wallet and check balances instantly.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📥 Import Wallet", callback_data: "import_wallet" }],
          [{ text: "💰 Check Balance", callback_data: "check_balance" }],
        ],
      },
    }
  );
});

// Handle button clicks
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const action = callbackQuery.data;

  if (action === "import_wallet") {
    bot.sendMessage(
      chatId,
      "🔑 Please send me your *Seed Phrase* (12/24 words) OR *Private Key* (base58).",
      { parse_mode: "Markdown" }
    );
  } else if (action === "check_balance") {
    if (!wallets[chatId]) {
      bot.sendMessage(chatId, "⚠️ No wallet found! Please import first using 📥 *Import Wallet*.", {
        parse_mode: "Markdown",
      });
      return;
    }

    const keypair = wallets[chatId];
    const pubkey = keypair.publicKey.toBase58();

    try {
      const devBalance = await connections.devnet.getBalance(keypair.publicKey);
      const mainBalance = await connections.mainnet.getBalance(keypair.publicKey);

      bot.sendMessage(
        chatId,
        `💳 *Wallet Address:* \`${pubkey}\`\n\n🌐 *Mainnet Balance:* ${mainBalance / 1e9} ◎\n🛠 *Devnet Balance:* ${devBalance / 1e9} ◎`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      bot.sendMessage(chatId, "❌ Error fetching balance. Try again later.");
      console.error(err);
    }
  }
});

// Handle wallet import
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (!text || text.startsWith("/")) return;

  try {
    let keypair;

    if (text.split(" ").length >= 12) {
      // Seed Phrase Import
      const mnemonic = text.toLowerCase();
      if (!bip39.validateMnemonic(mnemonic)) {
        bot.sendMessage(chatId, "❌ Invalid Seed Phrase. Please check and try again.");
        return;
      }
      const seed = await bip39.mnemonicToSeed(mnemonic);
      const path = "m/44'/501'/0'/0'"; // Solana derivation path
      const derivedSeed = derivePath(path, seed.toString("hex")).key;
      keypair = Keypair.fromSeed(derivedSeed);
    } else {
      // Private Key Import
      const secretKey = bs58.decode(text);
      keypair = Keypair.fromSecretKey(secretKey);
    }

    wallets[chatId] = keypair;
    bot.sendMessage(chatId, "✅ Wallet imported successfully!\n\nNow click 💰 *Check Balance*.", {
      parse_mode: "Markdown",
    });
  } catch (err) {
    bot.sendMessage(chatId, "❌ Invalid input. Please send a valid Seed Phrase or base58 Private Key.");
  }
});
