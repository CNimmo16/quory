import { PostgresDriver } from "./PostgresDriver";

it("passes values separately to postgres.js and returns query rows", async () => {
  const driver = Object.create(PostgresDriver.prototype) as PostgresDriver;
  const rows = [{ name: "\\' OR 1=1 --雪" }];
  const unsafe = jest.fn().mockResolvedValue(rows);
  driver.sql = { unsafe } as unknown as PostgresDriver["sql"];
  expect(
    await driver.exec("SELECT name FROM users WHERE name = $1", [rows[0]!.name])
  ).toEqual(rows);
  expect(unsafe).toHaveBeenCalledWith(
    "SELECT name FROM users WHERE name = $1",
    [rows[0]!.name]
  );
});

it("cancels the pending postgres.js query when aborted", async () => {
  const driver = Object.create(PostgresDriver.prototype) as PostgresDriver;
  let rejectQuery: (error: Error) => void = () => {};
  const query = new Promise((_, reject) => {
    rejectQuery = reject;
  });
  const cancel = jest.fn(() => {
    rejectQuery(new Error("cancelled"));
    return Promise.resolve();
  });
  Object.assign(query, { cancel });
  driver.sql = {
    unsafe: jest.fn().mockReturnValue(query),
  } as unknown as PostgresDriver["sql"];
  const controller = new AbortController();
  const running = driver.exec("SELECT pg_sleep(60)", [], {
    signal: controller.signal,
  });
  const rejected = expect(running).rejects.toThrow("cancelled");
  controller.abort();
  await rejected;
  expect(cancel).toHaveBeenCalledTimes(1);
});
