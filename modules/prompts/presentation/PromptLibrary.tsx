"use client";

import { Clipboard, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";

import styles from "./PromptLibrary.module.css";

type Prompt = {
  id: string;
  title: string;
  description: string;
  content: string;
  tags: string[];
  version: number;
};

export function PromptLibrary({ initialPrompts }: { initialPrompts: readonly Prompt[] }) {
  const [prompts, setPrompts] = useState(initialPrompts);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<Prompt | null>(null);

  async function analyze() {
    if (!content.trim()) return;
    setStatus("Ameth is preparing a suggestion…");
    const response = await fetch("/api/v1/prompts/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      setStatus("Analysis is unavailable. You can still save this prompt manually.");
      return;
    }
    const result = (await response.json()) as
      | { available: true; proposal: { title: string; description: string; tags: string[] } }
      | { available: false };
    if (!result.available) {
      setStatus("Analysis is unavailable. You can still save this prompt manually.");
      return;
    }
    setTitle(result.proposal.title);
    setDescription(result.proposal.description);
    setTags(result.proposal.tags.join(", "));
    setStatus("Review Ameth’s suggestion, then save when it is right for you.");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = {
      title,
      description,
      content,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    const response = await fetch(editing ? `/api/v1/prompts/${editing.id}` : "/api/v1/prompts", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing ? { ...draft, expectedVersion: editing.version, archived: false } : draft),
    });
    if (!response.ok) {
      setStatus("This prompt could not be saved. Check the required fields and try again.");
      return;
    }
    const saved = (await response.json()) as Prompt;
    setPrompts((current) =>
      editing ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current],
    );
    clearEditor();
    setStatus(
      editing
        ? "Prompt updated. It is ready to copy and use anywhere."
        : "Prompt saved. It is ready to copy and use anywhere.",
    );
  }

  function beginEdit(prompt: Prompt) {
    setEditing(prompt);
    setContent(prompt.content);
    setTitle(prompt.title);
    setDescription(prompt.description);
    setTags(prompt.tags.join(", "));
    setStatus("Review and update this saved prompt.");
  }

  function clearEditor() {
    setEditing(null);
    setContent("");
    setTitle("");
    setDescription("");
    setTags("");
  }

  async function remove(prompt: Prompt) {
    if (!window.confirm(`Delete “${prompt.title}”? This cannot be undone.`)) return;
    const response = await fetch(`/api/v1/prompts/${prompt.id}`, { method: "DELETE" });
    if (!response.ok) {
      setStatus("This prompt could not be deleted. Refresh and try again.");
      return;
    }
    setPrompts((current) => current.filter((item) => item.id !== prompt.id));
    if (editing?.id === prompt.id) clearEditor();
    setStatus("Prompt deleted.");
  }

  return (
    <section className={styles.screen} aria-labelledby="prompt-library-title">
      <header className={styles.header}>
        <p className="eyebrow">Trusted companion unlock</p>
        <h1 id="prompt-library-title">Prompt Library</h1>
        <p>Keep reusable prompts here, then copy them into the tools where you work.</p>
      </header>
      <form className={styles.editor} onSubmit={save}>
        <div className={styles.editorHeading}>
          <strong>{editing ? "Edit prompt" : "New prompt"}</strong>
          {editing && (
            <button
              className="icon-button"
              type="button"
              aria-label="Cancel prompt edit"
              onClick={clearEditor}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>
        <label htmlFor="prompt-content">Prompt</label>
        <textarea
          id="prompt-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={20_000}
          required
        />
        <div className={styles.actions}>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void analyze()}
            disabled={!content.trim()}
          >
            <Sparkles aria-hidden="true" /> Suggest details
          </button>
          <small>
            Suggestions send only this selected draft to OpenAI, never save automatically, and are available
            only when your key is configured.
          </small>
        </div>
        <div className={styles.details}>
          <label htmlFor="prompt-title">
            Title
            <input
              id="prompt-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
            />
          </label>
          <label htmlFor="prompt-description">
            Description
            <input
              id="prompt-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={280}
              required
            />
          </label>
          <label htmlFor="prompt-tags">
            Tags
            <input
              id="prompt-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              maxLength={280}
              placeholder="marketing, writing"
            />
          </label>
        </div>
        <button className="primary-button" type="submit">
          {editing ? "Save changes" : "Save prompt"}
        </button>
        {status && (
          <p className={styles.status} role="status">
            {status}
          </p>
        )}
      </form>
      <div className={styles.library}>
        {prompts.length === 0 ? (
          <p>No saved prompts yet.</p>
        ) : (
          prompts.map((prompt) => (
            <article className={styles.card} key={prompt.id}>
              <div>
                <h2>{prompt.title}</h2>
                <p>{prompt.description}</p>
              </div>
              <div className={styles.cardActions}>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Copy ${prompt.title}`}
                  onClick={() => void navigator.clipboard.writeText(prompt.content)}
                >
                  <Clipboard aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Edit ${prompt.title}`}
                  onClick={() => beginEdit(prompt)}
                >
                  <Pencil aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Delete ${prompt.title}`}
                  onClick={() => void remove(prompt)}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
              {prompt.tags.length > 0 && <p className={styles.tags}>{prompt.tags.join(" · ")}</p>}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
