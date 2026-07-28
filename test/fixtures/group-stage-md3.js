// Frozen mid-tournament snapshot of Euro 2024: Groups B–F complete, Group A two
// matchdays in with its final round still to play.
//
// Taken from the committed (real) results rather than invented, so the clinch and
// elimination engines meet an authentic configuration. This particular split is
// chosen because it is the interesting one: with five groups final, exactly ONE
// third-place slot is mathematically locked (M43 draws the Netherlands, since every
// still-reachable four-thirds combination sends group D's third there) while three
// others are genuinely still open. A snapshot where nothing locks would let the
// "locked third" path pass without ever running.
//
// Map of match number -> [t1, t2] final score.
export const GROUP_STAGE_MD3 = {"1":[5,1],"2":[1,3],"3":[3,0],"4":[2,1],"5":[1,2],"6":[1,1],"7":[0,1],"8":[3,0],"9":[0,1],"10":[0,1],"11":[3,1],"12":[2,1],"13":[2,2],"14":[2,0],"15":[1,1],"16":[1,1],"17":[1,1],"18":[1,0],"19":[1,2],"20":[1,3],"21":[0,0],"22":[1,1],"23":[0,3],"24":[2,0],"27":[0,1],"28":[1,1],"29":[1,1],"30":[2,3],"31":[0,0],"32":[0,0],"33":[1,1],"34":[0,0],"35":[1,2],"36":[2,0]}
