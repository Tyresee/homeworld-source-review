// Match radial-gradient(ellipse at 45% 42%, inner, outer) on a fixed canvas.
export function paintLookDevBackdrop(context,width,height,backdrop={}){
  const x=width*.45,y=height*.42;
  const radiusX=Math.max(x,width-x)*Math.SQRT2,radiusY=Math.max(y,height-y)*Math.SQRT2;
  context.save();context.translate(x,y);context.scale(radiusX,radiusY);
  const gradient=context.createRadialGradient(0,0,0,0,0,1);
  gradient.addColorStop(0,backdrop.inner??'#fcf7df');gradient.addColorStop(1,backdrop.outer??'#e5edce');
  context.fillStyle=gradient;context.fillRect(-x/radiusX,-y/radiusY,width/radiusX,height/radiusY);context.restore();
}
