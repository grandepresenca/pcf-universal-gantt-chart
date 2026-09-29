export const isErrorDialogOptions = (
  error: unknown
): error is ComponentFramework.NavigationApi.ErrorDialogOptions => {
  return (
    (error as ComponentFramework.NavigationApi.ErrorDialogOptions).errorCode !==
    undefined
  );
};
