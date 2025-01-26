import {
  Alert,
  AppShell,
  Loader,
  LoadingOverlay,
  Menu,
  NavLink as NonNavLink,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import {
  createRootRoute,
  Outlet,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import { AiOutlinePlus, AiOutlinePoweroff } from "react-icons/ai";
import { BsDatabaseFillGear } from "react-icons/bs";
import NavLink from "../components/NavLink";
import { MainDimensionsContext } from "../hooks/useMainDimensions";
import trpc from "../util/tprc";
import { Fragment, useEffect, useState } from "react";
import { TbPlus } from "react-icons/tb";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { ref, width, height } = useElementSize();

  const {
    data: savedConnectionsData,
    error: savedConnectionsError,
    refetch: refetchSavedConnections,
  } = trpc.connections.listSavedConnections.useQuery();

  const activeConnection = savedConnectionsData?.connections.find(
    ({ isActive }) => isActive
  );

  const { data: savedQueriesData, error: savedQueriesError } =
    trpc.queries.listSavedQueries.useQuery(undefined, {
      enabled: !!activeConnection,
    });

  const [mainDimensions, setMainDimensions] = useState({
    width,
    height,
  });
  useEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (box) {
      setMainDimensions({
        width: width ?? box.width,
        height: height ?? box.height,
      });
    }
  }, [ref, savedQueriesData, savedConnectionsData, width, height]);

  const navigate = useNavigate();

  const utils = trpc.useUtils();

  const { mutate: disconnectFromDatabase } =
    trpc.connections.disconnectFromDatabase.useMutation({
      onSuccess: () => {
        refetchSavedConnections();
        utils.connections.fetchActiveConnection.invalidate();
        navigate({ to: "/connections" });
      },
      onError: () => {
        // TODO: nicer error alert
        alert("Could not disconnect from database");
      },
    });

  const { mutate: connectToDatabase } =
    trpc.connections.connectToDatabase.useMutation({
      onSuccess: () => {
        navigate({ to: "/queries" });
      },
    });

  const matchRoute = useMatchRoute();

  if (savedConnectionsError || savedQueriesError) {
    return (
      <div className="flex h-full items-center justify-center">
        <Alert color="red">
          {savedConnectionsError?.message || savedQueriesError?.message}
        </Alert>
      </div>
    );
  }

  if (!savedConnectionsData) {
    return <LoadingOverlay />;
  }

  return (
    <>
      <hr />
      <AppShell
        navbar={{
          width: 300,
          breakpoint: "xs",
          collapsed: {},
        }}
      >
        {activeConnection ? (
          <AppShell.Navbar>
            {/* <NavLink
              leftSection={<AiFillGold />}
              label="Entities"
              to="/entities"
            /> */}
            <NavLink
              leftSection={<AiOutlinePlus />}
              label="New query"
              to={`/queries`}
              activeOptions={{ exact: true }}
            />
            {savedQueriesData ? (
              savedQueriesData.queries.map(({ id, query }) => (
                <Fragment key={id}>
                  <NavLink
                    className="px-3 py-2"
                    label={query.nickname}
                    to="/queries/$queryId"
                    params={{ queryId: id }}
                  />
                </Fragment>
              ))
            ) : (
              <Loader />
            )}
            <div className="mt-auto">
              <Menu position="top">
                <Menu.Target>
                  <NonNavLink
                    label={
                      <span className="flex justify-between">
                        <span>{`${activeConnection.id.substring(0, 20)}${
                          activeConnection.id.length > 10 ? "..." : ""
                        }`}</span>
                        <span className="text-sm text-slate-700">
                          ({activeConnection.connection?.type})
                        </span>
                      </span>
                    }
                    leftSection={<BsDatabaseFillGear />}
                  />
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{activeConnection.id}</Menu.Label>
                  <Menu.Item
                    leftSection={<AiOutlinePoweroff />}
                    onClick={() => disconnectFromDatabase()}
                  >
                    Disconnect
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
          </AppShell.Navbar>
        ) : (
          <AppShell.Navbar>
            <NavLink
              label="New connection"
              to="/connections"
              activeOptions={{ exact: true }}
              leftSection={<TbPlus />}
            />
            {savedConnectionsData.connections.map(
              ({ id: connectionId, connection }) => (
                <NonNavLink
                  key={connectionId}
                  label={connection.nickname}
                  description={
                    matchRoute({
                      to: "/connections/$connectionId",
                      params: { connectionId },
                    }) && "Double click to connect"
                  }
                  onDoubleClick={() => {
                    connectToDatabase({ connectionId });
                  }}
                  onClick={() =>
                    navigate({
                      to: "/connections/$connectionId",
                      params: { connectionId },
                    })
                  }
                  active={
                    matchRoute({
                      to: "/connections/$connectionId",
                      params: { connectionId },
                    })
                      ? true
                      : false
                  }
                />
              )
            )}
          </AppShell.Navbar>
        )}

        <AppShell.Main ref={ref}>
          <MainDimensionsContext.Provider value={mainDimensions}>
            <Outlet />
          </MainDimensionsContext.Provider>
        </AppShell.Main>
      </AppShell>
    </>
  );
}
