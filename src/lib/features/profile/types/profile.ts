// The profile that keeps the data from before profiles existed. It lives in
// types and not in domain because ProfileStore needs it, and stores cannot
// import domain.
export const DEFAULT_PROFILE_ID = "default";
