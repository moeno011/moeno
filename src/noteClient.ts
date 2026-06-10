import axios, { AxiosInstance } from "axios";
import FormData from "form-data";
import fs from "fs";
import mime from "mime-types";
import path from "path";

export interface NoteLoginCredentials {
  email: string;
  password: string;
}

export interface NoteArticleInput {
  name: string;
  body: string;
  status?: "draft" | "published";
  eyecatch?: string;
  hashtags?: string[];
}

export interface NoteArticle {
  id: number;
  key: string;
  name: string;
  body: string;
  status: string;
  url: string;
}

export class NoteClient {
  private client: AxiosInstance;
  private userSlug?: string;

  constructor() {
    this.client = axios.create({
      baseURL: "https://note.com",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      withCredentials: true,
    });

    this.client.interceptors.request.use((config) => {
      return config;
    });
  }

  async login(credentials: NoteLoginCredentials): Promise<void> {
    const response = await this.client.post("/api/v1/sessions", {
      login: credentials.email,
      password: credentials.password,
    });

    const { user } = response.data.data;
    this.userSlug = user.urlname;

    const cookies = response.headers["set-cookie"];
    if (cookies) {
      const cookieStr = cookies.join("; ");
      this.client.defaults.headers.common["Cookie"] = cookieStr;

      const noteSessionToken = cookies
        .map((c: string) => c.split(";")[0])
        .find((c: string) => c.startsWith("note_session_v2="));
      if (noteSessionToken) {
        const token = noteSessionToken.split("=")[1];
        this.client.defaults.headers.common["X-Note-Token"] = token;
      }
    }

    console.log(`Logged in as: ${this.userSlug}`);
  }

  async uploadImage(imagePath: string): Promise<string> {
    const form = new FormData();
    const fileBuffer = fs.readFileSync(imagePath);
    const mimeType = mime.lookup(imagePath) || "image/jpeg";
    const fileName = path.basename(imagePath);

    form.append("file", fileBuffer, {
      filename: fileName,
      contentType: mimeType,
    });

    const response = await this.client.post("/api/v1/attachments", form, {
      headers: {
        ...form.getHeaders(),
      },
    });

    return response.data.data.url;
  }

  async createArticle(article: NoteArticleInput): Promise<NoteArticle> {
    let eyecatchImageUrl: string | undefined;

    if (article.eyecatch) {
      console.log(`Uploading eyecatch image: ${article.eyecatch}`);
      eyecatchImageUrl = await this.uploadImage(article.eyecatch);
    }

    const hashtags = article.hashtags?.map((tag) => ({ name: tag })) ?? [];

    const payload: Record<string, unknown> = {
      name: article.name,
      body: article.body,
      status: article.status ?? "draft",
      hashtag_notes_attributes: hashtags,
    };

    if (eyecatchImageUrl) {
      payload.eyecatch_image_url = eyecatchImageUrl;
    }

    const response = await this.client.post("/api/v2/text_notes", payload);
    const note = response.data.data;

    return {
      id: note.id,
      key: note.key,
      name: note.name,
      body: note.body,
      status: note.status,
      url: `https://note.com/${this.userSlug}/n/${note.key}`,
    };
  }

  async updateArticle(
    noteKey: string,
    article: Partial<NoteArticleInput>
  ): Promise<NoteArticle> {
    const payload: Record<string, unknown> = {};

    if (article.name !== undefined) payload.name = article.name;
    if (article.body !== undefined) payload.body = article.body;
    if (article.status !== undefined) payload.status = article.status;
    if (article.hashtags !== undefined) {
      payload.hashtag_notes_attributes = article.hashtags.map((tag) => ({
        name: tag,
      }));
    }

    if (article.eyecatch) {
      const eyecatchImageUrl = await this.uploadImage(article.eyecatch);
      payload.eyecatch_image_url = eyecatchImageUrl;
    }

    const response = await this.client.put(
      `/api/v2/text_notes/${noteKey}`,
      payload
    );
    const note = response.data.data;

    return {
      id: note.id,
      key: note.key,
      name: note.name,
      body: note.body,
      status: note.status,
      url: `https://note.com/${this.userSlug}/n/${note.key}`,
    };
  }

  async getUserNotes(): Promise<NoteArticle[]> {
    if (!this.userSlug) {
      throw new Error("Not logged in");
    }

    const response = await this.client.get(
      `/api/v2/creators/${this.userSlug}/contents`,
      {
        params: { kind: "note", page: 1 },
      }
    );

    return response.data.data.contents.map(
      (note: Record<string, unknown>) => ({
        id: note.id,
        key: note.key,
        name: note.name,
        body: note.body ?? "",
        status: note.status,
        url: `https://note.com/${this.userSlug}/n/${note.key}`,
      })
    );
  }
}
