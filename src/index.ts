import { Command } from "commander";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { NoteClient, NoteArticleInput } from "./noteClient";

dotenv.config();

const program = new Command();

program
  .name("moeno")
  .description("note.com article upload tool")
  .version("1.0.0");

program
  .command("upload")
  .description("Upload an article to note.com")
  .requiredOption("-t, --title <title>", "Article title")
  .requiredOption("-f, --file <file>", "Path to article body file (markdown or text)")
  .option("-e, --eyecatch <image>", "Path to eyecatch image")
  .option(
    "-s, --status <status>",
    "Article status: draft or published",
    "draft"
  )
  .option("--tags <tags>", "Comma-separated hashtags (e.g. tech,programming)")
  .action(async (options) => {
    const email = process.env.NOTE_EMAIL;
    const password = process.env.NOTE_PASSWORD;

    if (!email || !password) {
      console.error(
        "Error: NOTE_EMAIL and NOTE_PASSWORD environment variables are required."
      );
      console.error("Create a .env file or set the environment variables.");
      process.exit(1);
    }

    if (!fs.existsSync(options.file)) {
      console.error(`Error: File not found: ${options.file}`);
      process.exit(1);
    }

    if (options.eyecatch && !fs.existsSync(options.eyecatch)) {
      console.error(`Error: Eyecatch image not found: ${options.eyecatch}`);
      process.exit(1);
    }

    const body = fs.readFileSync(options.file, "utf-8");
    const hashtags = options.tags
      ? options.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];

    const article: NoteArticleInput = {
      name: options.title,
      body,
      status: options.status,
      hashtags,
    };

    if (options.eyecatch) {
      article.eyecatch = path.resolve(options.eyecatch);
    }

    const client = new NoteClient();

    try {
      console.log("Logging in to note.com...");
      await client.login({ email, password });

      console.log("Uploading article...");
      const result = await client.createArticle(article);

      console.log("\nArticle uploaded successfully!");
      console.log(`  Title : ${result.name}`);
      console.log(`  Status: ${result.status}`);
      console.log(`  URL   : ${result.url}`);
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: unknown }; message?: string };
      if (error.response) {
        console.error(`API error ${error.response.status}:`, JSON.stringify(error.response.data, null, 2));
      } else {
        console.error("Error:", error.message);
      }
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List your note.com articles")
  .action(async () => {
    const email = process.env.NOTE_EMAIL;
    const password = process.env.NOTE_PASSWORD;

    if (!email || !password) {
      console.error(
        "Error: NOTE_EMAIL and NOTE_PASSWORD environment variables are required."
      );
      process.exit(1);
    }

    const client = new NoteClient();

    try {
      console.log("Logging in to note.com...");
      await client.login({ email, password });

      console.log("Fetching articles...");
      const articles = await client.getUserNotes();

      if (articles.length === 0) {
        console.log("No articles found.");
        return;
      }

      console.log(`\nFound ${articles.length} article(s):\n`);
      articles.forEach((article, i) => {
        console.log(`${i + 1}. [${article.status}] ${article.name}`);
        console.log(`   Key: ${article.key}`);
        console.log(`   URL: ${article.url}`);
        console.log();
      });
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: unknown }; message?: string };
      if (error.response) {
        console.error(`API error ${error.response.status}:`, JSON.stringify(error.response.data, null, 2));
      } else {
        console.error("Error:", error.message);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
