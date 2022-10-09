# notion-github-sync

This bot syncs public Notion pages as GitHub Discussions/Issues. It's done periodically, based on the pages shared with the Notion Integration, and based on metadata specific on your Notion page.

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
/github-public dotansimha/test-notion-sync discussion
```

You can also specify a custom GitHub Discussion category (the default is General):

```
/github-public dotansimha/test-notion-sync discussion General
```

Or, as an issue:

You can also specify a custom GitHub Discussion category (the default is General):

```
/github-public dotansimha/test-notion-sync issue
```

You can find a synced example page here: https://github.com/dotansimha/test-notion-sync/discussions/12

To remove a public discussion:

1. Make sure to delete the annotation from your page.
2. Wait for the next sync (or, manually run it)
3. You can also remove now the integration access from the page.

## Getting started (development)

1. Clone this repo
2. Make sure to install Wrangler CLI: https://developers.cloudflare.com/workers/wrangler/get-started/ and use `pnpm`
3. Create a Notion integration and get your Notion token (see https://www.notion.so/my-integrations). Use the token as `NOTION_TOKEN` env var.
4. Create a GitHub Personal Access token for the relevant user (to create/update/delete the GH Discussions). Use the token as `GH_BOT_TOKEN` env var.
5. Create `.dev.vars` file and add `NOTION_TOKEN` and `GH_BOT_TOKEN` to it (and other env vars if needed, see below)
6. Run `pnpm generate` to generate TypeScript types for the GraphQL queries.
7. Run `pnpm install`
8. Run `pnpm start` for development.

> We use Wrangler for the Worker development.

## Config

The following configurations can be set in the env of your project, in order to customize how the bot will run:

- `NOTION_TOKEN` - required, a Notion intergraion API key
- `GH_BOT_TOKEN` - requried (also during development)
- `DRY_RUN` - set to `1` if you wish to just test the create/update/delete plan of this bot, without affecting any data on GitHub.
- `ENABLE_FETCH` - Set to `1` to enable. This will enable the `fetch` event for the worker, this is helpful for development if you want to trigger the bot manually, or if you wish your bot to have a manual trigger.
- `CUSTOM_HEADER_LINK` - customize the link added to the header of every GitHub issue/discussion. To use an external like, you can add markdown, for example: `[The Guild's](https://the-guild.dev)`.

For local development, please add your config to a file called `.dev.vars`

## Deployment (as CloudFlare Worker)

- Every change to `main` branch will run CI and deploy to prod.
- Make sure to configure your `NOTION_TOKEN` and `GH_BOT_TOKEN` (PAT) as part of the env vars.
- You can also deploy from local env by running: `pnpm run deploy`

> If you wish to have a clone of your own, make sure to rename worker name in the `wrangler.toml` file
