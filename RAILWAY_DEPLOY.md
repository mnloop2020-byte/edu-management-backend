Railway backend deploy checklist

1. Set the service root directory to `backend`.
2. Ensure the service deploys the latest branch/commit that contains the fixed `src/controllers/payments.controller.js`.
3. If Railway cached an older build, trigger a redeploy with cleared build cache.
4. With `nixpacks.toml` present, Railway will:
   - install dependencies
   - run `prisma generate`
   - run `prisma migrate deploy`
   - start the API with `npm start`

Expected start command:

`npm start`

Expected working directory:

`backend`
