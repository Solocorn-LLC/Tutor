# Google Cloud Storage (GCS) Setup Guide

This guide walks through configuring GCS for persistent file storage in the Solocorn app. When GCS is configured, all file uploads (avatars, assignments, messages, resources, documents) are stored in the cloud. When GCS is **not** configured, the app falls back to a persistent local directory (`{project-root}/.local-storage/`).

---

## 1. Create a GCS Bucket

### Via GCP Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and select your project.
2. Navigate to **Cloud Storage → Buckets**.
3. Click **Create**.
4. Configure:
   - **Name**: e.g. `solocorn-uploads`
   - **Location type**: Multi-region (recommended) or Region closest to your users
   - **Storage class**: Standard
   - **Access control**: Uniform
   - **Prevent public access**: Enforced (files are served via signed URLs, not public buckets)
5. Click **Create**.

### Optional: Create a second bucket for video content

If you want to separate video content from other uploads, create a second bucket (e.g. `solocorn-videos`) and set `GCS_VIDEO_BUCKET` in your environment.

---

## 2. Create a Service Account

1. In GCP Console, go to **IAM & Admin → Service Accounts**.
2. Click **Create Service Account**.
3. Give it a name like `solocorn-storage`.
4. Grant the following roles:
   - **Storage Object Admin** (`roles/storage.objectAdmin`)
   - **Storage Object Viewer** (`roles/storage.objectViewer`)
5. Click **Done**.

---

## 3. Create and Download a Service Account Key

1. Find your service account in the list and click it.
2. Go to the **Keys** tab.
3. Click **Add Key → Create New Key**.
4. Select **JSON** and click **Create**.
5. A `.json` file will download to your computer. **Keep this secure.**

---

## 4. Configure Environment Variables

Add the following to your `.env.local` file:

```bash
# GCS Bucket name
GCS_BUCKET=your-bucket-name

# GCP Project ID
GCP_PROJECT_ID=your-gcp-project-id

# Service Account Key (paste the entire JSON content, single-quoted)
GCP_SA_KEY='{"type":"service_account","project_id":"..."}'

# Optional: override the local fallback directory for development
# LOCAL_STORAGE_DIR=/path/to/local/storage
```

> **Note**: The `GCP_SA_KEY` must be valid JSON. You can paste the contents of the downloaded `.json` file directly, wrapped in single quotes.

---

## 5. Verify Configuration

Restart your dev server and test an upload (e.g., upload a profile photo). Check the server logs:

- If GCS is configured, you should see files being uploaded to your bucket.
- If GCS is **not** configured, files are saved to `{project-root}/.local-storage/`.

---

## How It Works

| Feature                 | GCS Configured                          | GCS Not Configured (local dev)        |
| ----------------------- | --------------------------------------- | ------------------------------------- |
| **File storage**        | Cloud bucket                            | Persistent local directory            |
| **Avatar serving**      | `/api/public/avatar/...` → GCS download | `/api/public/avatar/...` → local file |
| **Assignment uploads**  | GCS bucket                              | `.local-storage/submissions/`         |
| **Message attachments** | GCS bucket                              | `.local-storage/messages/`            |
| **Resource uploads**    | GCS bucket                              | `.local-storage/resources/`           |
| **Document uploads**    | GCS bucket                              | `.local-storage/documents/`           |
| **File access**         | Fresh signed URL (1-hour expiry)        | `/api/serve-upload/{key}`             |
| **Persistence**         | Survives container restarts             | Survives app restarts                 |

### Signed URLs

When GCS is configured, the app generates **fresh v4 signed URLs** every time a file is requested:

- **Upload URLs**: 15-minute expiry (presigned PUT)
- **Download URLs**: 1-hour expiry (presigned GET), refreshed on each request

This ensures unauthorized users cannot access private files, and links expire automatically.

### Local Fallback

The local fallback directory is:

- **Default**: `{project-root}/.local-storage/`
- **Override**: Set `LOCAL_STORAGE_DIR` env var

This directory is **gitignored** by default. Files persist across app restarts but are not shared across machines.

---

## Troubleshooting

### "GCS not configured" in logs

- Check that `GCS_BUCKET` is set in your environment.
- Verify `GCP_SA_KEY` is valid JSON.

### Files not persisting in local dev

- Check that `LOCAL_STORAGE_DIR` is writable.
- The default `.local-storage/` directory is created automatically.

### Build errors related to `@google-cloud/storage`

- The app dynamically imports `@google-cloud/storage` to avoid webpack issues.
- If you see errors, ensure the package is installed: `npm install @google-cloud/storage`
