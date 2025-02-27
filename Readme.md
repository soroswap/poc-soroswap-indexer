## Setup the project

1. **Install the dependencies**: Run the following command to install all necessary dependencies.
  ```bash
  yarn
  ```

2. **Create the .env file**: Copy the example environment file to create your own `.env` file.
  ```bash
  cp .env.example .env
  ```

3. **Create or start the database**:
  - To create the database and run migrations, use the following commands:
    ```bash
    docker run --name postgres-container -e POSTGRES_USER=username -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
    prisma migrate dev
    prisma db push
    ```
  - If the database container already exists, you can start it with:
    ```bash
    docker start postgres-container
    ```

4. **Start the server**: Finally, start the development server with:
  ```bash
  yarn dev
  ```

## Inspect the database
Once the app and database are running, you can inspect the database by opening a new terminal and running the following command:
```bash
yarn prisma studio
```
this will start the Prisma Studio at port 5555.