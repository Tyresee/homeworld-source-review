/** Minimal DOM for executing the real shop renderer in isolated tests. */
export function documentForShop(){
  const attributeKey=name=>name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
  const document={activeElement:null};
  class Node {
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.dataset={};this.attributes=new Map();this.events=new Map();this.className='';this._text='';this.open=false;this.scrollTop=0;this.scrollLeft=0;
      const change=(name,enabled)=>{const rows=new Set(this.className.split(/\s+/).filter(Boolean));enabled?rows.add(name):rows.delete(name);this.className=[...rows].join(' ');};
      this.classList={contains:name=>this.className.split(/\s+/).includes(name),add:name=>change(name,true),remove:name=>change(name,false),
        toggle:(name,force)=>{const enabled=force===undefined?!this.classList.contains(name):!!force;change(name,enabled);return enabled;}};
    }
    get isConnected(){return this===document.body||!!this.parentNode?.isConnected;}
    get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
    set textContent(value){this.replaceChildren();this._text=String(value);}
    append(...nodes){for(const value of nodes){const node=typeof value==='string'?Object.assign(new Node('#text'),{_text:value}):value;if(node.tagName==='#FRAGMENT'){this.append(...node.children.slice());continue;}node.remove();node.parentNode=this;this.children.push(node);}}
    prepend(...nodes){const previous=this.children.slice();this.replaceChildren(...nodes,...previous);}
    replaceChildren(...nodes){for(const node of this.children)node.parentNode=null;this.children=[];this._text='';this.append(...nodes);}
    remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}}
    replaceWith(node){const parent=this.parentNode;if(!parent)return;const index=parent.children.indexOf(this);node.remove();parent.children[index]=node;node.parentNode=parent;this.parentNode=null;}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}
    setAttribute(name,value){if(name.startsWith('data-'))this.dataset[attributeKey(name)]=String(value);else this.attributes.set(name,String(value));}
    getAttribute(name){return name.startsWith('data-')?this.dataset[attributeKey(name)]??null:this.attributes.get(name)??null;}
    hasAttribute(name){return this.getAttribute(name)!==null;}
    matches(selector){
      if(selector.startsWith('.'))return selector.slice(1).split('.').every(name=>this.classList.contains(name));
      if(selector.startsWith('#'))return this.id===selector.slice(1);
      if(selector.startsWith('[')){const match=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);return !!match&&this.hasAttribute(match[1])&&(match[2]===undefined||this.getAttribute(match[1])===match[2]);}
      return this.tagName===selector.toUpperCase();
    }
    querySelectorAll(selector){
      const selectors=selector.split(',').map(value=>value.trim().split(/\s+/));
      const matches=node=>selectors.some(parts=>{if(!node.matches(parts.at(-1)))return false;let parent=node.parentNode;for(let index=parts.length-2;index>=0;index--){while(parent&&!parent.matches(parts[index]))parent=parent.parentNode;if(!parent)return false;parent=parent.parentNode;}return true;});
      const result=[];const visit=parent=>{for(const child of parent.children){if(matches(child))result.push(child);visit(child);}};visit(this);return result;
    }
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
    addEventListener(type,callback){const rows=this.events.get(type)??[];rows.push(callback);this.events.set(type,rows);}
    dispatch(type){const event={type,target:this,preventDefault(){}};for(const callback of this.events.get(type)??[])callback(event);}
    click(){if(!this.disabled)this.dispatch('click');}
    focus(){if(this.isConnected)document.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatch('close');}
  }
  document.body=new Node('body');document.activeElement=document.body;
  document.createElement=tag=>new Node(tag);document.createElementNS=(_,tag)=>new Node(tag);document.createDocumentFragment=()=>new Node('#fragment');
  return document;
}
