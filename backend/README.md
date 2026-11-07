# Backend API tests

The API test command runs all suites by default. To run one suite, pass its name with `--suite`.

| Suite | Coverage |
| --- | --- |
| `pets` | Pet listing, details, creation, and status |
| `applications` | Adoption application submission and listing |
| `wishlists` | Add, list, and remove wishlist pets |
| `updates` | Pet update timeline and submission |
| `messaging` | Sending chat messages |
| `reviews` | Creating and validating user reviews |
| `all` | Run every suite (default) |

## Run locally

From the `backend` directory:

```powershell
npm run test:api
npm run test:api -- --suite pets
npm run test:api -- --suite applications
npm run test:api -- --suite wishlists
npm run test:api -- --suite updates
npm run test:api -- --suite messaging
npm run test:api -- --suite reviews
```

## Run with Docker Compose

From the repository root, with the Compose services running:

```powershell
docker compose exec -T backend npm run test:api
docker compose exec -T backend npm run test:api -- --suite pets
docker compose exec -T backend npm run test:api -- --suite applications
docker compose exec -T backend npm run test:api -- --suite wishlists
docker compose exec -T backend npm run test:api -- --suite updates
docker compose exec -T backend npm run test:api -- --suite messaging
docker compose exec -T backend npm run test:api -- --suite reviews
```

Tests use `DATABASE_URL` and `JWT_SECRET` from the backend environment. `API_BASE_URL` is optional and defaults to `http://localhost:5000/api/v1`. Each run creates uniquely identified database fixtures and removes them afterward.

The non-pet suites follow the API specification. They will fail with a not-found response until their endpoints are implemented by the backend.
