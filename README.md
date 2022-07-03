# notion-github-sync

This bot syncs public Notion pages as GitHub Discussions. It's done periodically, based on the pages shared with the Notion Integration, and based on metadata specific on your Notion page. 

## Usage 

To use this tool, please make sure to have the following:

1. Deploy this tool or run it locally with the relevant env vars.
2. Make sure to add the user your wish to use as collaborator in your repos (this is needed only in order to delete Discussions)
3. To make a Notion page public and syncable, first make sure to share this page with the Notion Integration you created: 

![image](https://user-images.githubusercontent.com/3680083/177030441-7110357f-5f48-400e-b043-ed77fda794f1.png)

4. If you wish to make the Notion page public (with the Notion url), also tick `Share to web`: 

![image](https://user-images.githubusercontent.com/3680083/177030470-bd8bafc5-a0ee-4c2e-920b-a7b3d2000483.png)

5. Annotate the top of your Notion page with the repo you wish to sync the page with the following text (NOT as code block, just as text - this should be the first block of your Notion page):

```
/github-public dotansimha/test-notion-sync
```

You can also specify a custom GitHub Discussion category  (the default is General):

```
/github-public dotansimha/test-notion-sync General
```

You can find an synced example page here: https://github.com/dotansimha/test-notion-sync/discussions/12


To remove a public discussion:

1. Make sure to delete the annotation from your page.
2. Wait for the next sync (or, manually run it)
3. You can also remove now the integration access from the page.

## Getting started (development)

1. Clone this repo 
2. Make sure to install Wrangler CLI: https://developers.cloudflare.com/workers/wrangler/get-started/
3. Create a Notion integration and get your Notion token (see https://www.notion.so/my-integrations). Use the token as `NOTION_TOKEN` env var.
4. Create a GitHub Personal Access token for the relevant user (to create/update/delete the GH Discussions). Use the token as `GH_BOT_TOKEN` env var.
5. Run `npm install`
6. Run `npm start` for development. 

> We use Wrangler for the Worker development.

## Deployment (as CloudFlare Worker)

- Every change to `main` branch will run CI and deploy to prod. 
- Make sure to configure your `NOTION_TOKEN` and `GH_BOT_TOKEN` (PAT) as part of the env vars. 
- You can also deploy from local env by running: `npm run deploy`

> If you wish to have a clone of your own, make sure to rename worker name in the `wrangler.toml` file
