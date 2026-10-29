// The roster and login checks should not wait for the Three.js editor graph.
// Start this once a student is selected, in parallel with their save request.
let loading;
export function loadStudentHomeScene(){
  loading??=import('./student-home-editor.js').then(module=>module.createStudentHomeScene).catch(error=>{
    loading=null;
    throw error;
  });
  return loading;
}
