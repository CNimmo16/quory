import { MySQLDriver } from "./MySQLDriver";

it("uses server-side binding and returns the actual query rows", async () => {
  const driver = Object.create(MySQLDriver.prototype) as MySQLDriver;
  const rows = [{ name: "\\' OR 1=1 --\0雪" }];
  const execute = jest.fn().mockResolvedValue([rows, []]);
  const release = jest.fn();
  driver.pool = {
    getConnection: jest.fn().mockResolvedValue({ execute, release }),
  } as unknown as MySQLDriver["pool"];
  expect(
    await driver.exec("SELECT name FROM users WHERE name = ?", [rows[0]!.name]),
  ).toEqual(rows);
  expect(release).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledWith(
    "SELECT name FROM users WHERE name = ?",
    [rows[0]!.name],
  );
});

it("ends its pool once across concurrent teardown calls", async () => {
  const driver = Object.create(MySQLDriver.prototype) as MySQLDriver;
  const end = jest.fn().mockResolvedValue(undefined);
  driver.pool = { end } as unknown as MySQLDriver["pool"];
  await Promise.all([driver.teardown(), driver.teardown()]);
  expect(end).toHaveBeenCalledTimes(1);
});

it("destroys a cancelled query's connection and never returns it to the pool", async () => {
  const driver = Object.create(MySQLDriver.prototype) as MySQLDriver;
  let rejectQuery: (error: Error) => void = () => {};
  const release = jest.fn();
  const destroy = jest.fn(() => rejectQuery(new Error("cancelled")));
  const execute = jest.fn(
    () =>
      new Promise((_, reject) => {
        rejectQuery = reject;
      }),
  );
  driver.pool = {
    getConnection: jest.fn().mockResolvedValue({ execute, release, destroy }),
  } as unknown as MySQLDriver["pool"];
  const controller = new AbortController();
  const running = driver.exec("SELECT SLEEP(60)", [], {
    signal: controller.signal,
  });
  const rejected = expect(running).rejects.toThrow("cancelled");
  await Promise.resolve();
  controller.abort();
  await rejected;
  expect(destroy).toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
});
