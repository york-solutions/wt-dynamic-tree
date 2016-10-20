(function(){

  var originOffsetX = 500,
      originOffsetY = 300,
      boxWidth = 200,
      boxHeight = 50,
      nodeWidth = boxWidth * 1.5,
      nodeHeight = boxHeight * 2;

  /**
   * Constructor
   */
  var TreeViewer = window.TreeViewer = function(selector, startId){

    var container = document.querySelector(selector),
        width = container.offsetWidth,
        height = container.offsetHeight;

    var self = this;

    // Setup zoom and pan
    var zoom = d3.behavior.zoom()
      .scaleExtent([.1,1])
      .on('zoom', function(){
        svg.attr("transform", "translate(" + d3.event.translate + ") scale(" + d3.event.scale + ")");
      })
      // Offset so that first pan and zoom does not jump back to the origin
      .translate([originOffsetX, originOffsetY]);

    var svg = d3.select(container).append('svg')
      .attr('width', width)
      .attr('height', height)
      .call(zoom)
      .append('g')
      // Left padding of tree; TODO: find a better way
      .attr("transform", "translate(" + originOffsetX + "," + originOffsetY + ")");

    // Setup controllers for the ancestor and descendant trees
    self.ancestorTree = new AncestorTree(svg);
    self.descendantTree = new DescendantTree(svg);

    // Listen to tree events
    self.ancestorTree.expand(function(person){
      return self.loadMore(person);
    });

    self.descendantTree.expand(function(person){
      return self.loadMore(person);
    });

    var defs = svg.append('defs');

    // Setup loading pattern
    defs.append('pattern')
        .attr({
          id: 'loader',
          width: 20,
          height: 20
        })
        .append('image')
        .attr({
          width: 20,
          height: 20,
          'xlink:href': 'ringLoader.svg'
        });

    // Setup clip path for node names
    defs.append('clipPath')
      .attr('id', 'name-clip')
      .append('rect')
      .attr('x', -boxWidth / 2)
      .attr('y', -boxHeight / 2)
      .attr('width', boxWidth - 8)
      .attr('height', 30);

    self.load(startId);

  };

  /** Static variable to hold unique ids for private persons **/
  TreeViewer.nextPrivateId = -1;

  /**
   * Load and display a person
   */
  TreeViewer.prototype.load = function(id){
    var self = this;
    self._load(id).then(function(person){
      self.drawTree(person);
    });
  };

  /**
   * Load more ancestors. Update existing data in place
   */
  TreeViewer.prototype.loadMore = function(oldPerson){
    var self = this;

    return self._load(oldPerson.getId()).then(function(newPerson){
      var mother = newPerson.getMother(),
          father = newPerson.getFather();

/*
      if (newPerson.getMotherId() == -1) {
         mother = new wikitree.Person({});
         mother._data.Id = TreeViewer.nextPrivateId--;
         mother._data.BirthNamePrivate = '[private mother]';
         mother._data.Gender = 'Female';
         mother._data.Father = 0;
         mother._data.Mother = 0;
         mother._data.Parents = {};
        console.log("new person get mother returned id = -1");
        for (i in mother._data) { console.log('mother._data.'+i+' = '+mother._data[i]); }
      }
      if (newPerson.getFatherId() == -1) {
         father = new wikitree.Person({});
         father._data.Id = TreeViewer.nextPrivateId--;
         father._data.BirthNamePrivate = '[private father]';
         father._data.Gender = 'Male';
         father._data.Father = 0;
         father._data.Mother = 0;
         father._data.Parents = {};
      }
*/

      if(mother){
        oldPerson.setMother(mother);
      }
      if(father){
        oldPerson.setFather(father);
      }
      oldPerson.setChildren(newPerson.getChildren());
      self.drawTree();
    });
  };


  /**
   * Main WikiTree API call
   */
  TreeViewer.prototype._load = function(id){
    return wikitree.getPerson(id, [
      'Id',
      'Derived.BirthName',
      'Derived.BirthNamePrivate',
      'FirstName',
      'LastNameCurrent',
      'BirthDate',
      'BirthLocation',
      'DeathDate',
      'DeathLocation',
      'Mother',
      'Father',
      'Children',
      'Parents',
      'Photo',
      'Name',
      'Gender',
      'Privacy'
    ]);
  };

  /**
   * Draw/redraw the tree
   */
  TreeViewer.prototype.drawTree = function(data){
    if(data){
      this.ancestorTree.data(data);
      this.descendantTree.data(data);
    }
    this.ancestorTree.draw();
    this.descendantTree.draw();
  };

  /**
   * Shared code for drawing ancestors or descendants.
   * `selector` is a class that will be applied to links
   * and nodes so that they can be queried later when
   * the tree is redrawn.
   * `direction` is either 1 (forward) or -1 (backward).
   */
  var Tree = function(svg, selector, direction){
    this.svg = svg;
    this.root = null;
    this.selector = selector;
    this.direction = typeof direction === 'undefined' ? 1 : direction;

    this._expand = function(){
      return $.Deferred().resolve().promise();
    };

    this.tree = d3.layout.tree()
      .nodeSize([nodeHeight, nodeWidth])
      .separation(function(){
        return 1;
      });
  };

  /**
   * Set the `children` function for the tree
   */
  Tree.prototype.children = function(fn){
    this.tree.children(fn);
    return this;
  };

  /**
   * Set the root of the tree
   */
  Tree.prototype.data = function(data){
    this.root = data;
    return this;
  };

  /**
   * Set a function to be called when the tree is expanded.
   * The function will be passed a person representing whose
   * line needs to be expanded. The registered function
   * should return a promise. When it's resolved the state
   * will be updated.
   */
  Tree.prototype.expand = function(fn){
    this._expand = fn;
    return this;
  };

  /**
   * Draw/redraw the tree
   */
  Tree.prototype.draw = function(){
    if(this.root){
      var nodes = this.tree.nodes(this.root),
          links = this.tree.links(nodes);
      this.drawLinks(links);
      this.drawNodes(nodes);
    } else {
      throw new Error('Missing root');
    }
    return this;
  };

  /**
   * Draw/redraw the connecting lines
   */
  Tree.prototype.drawLinks = function(links){

    var self = this;

    // Get a list of existing links
    var link = this.svg.selectAll("path.link." + this.selector)
        .data(links, function(link){
          return link.target.getId();
        });

    // Add new links
    link.enter().append("path")
        .attr("class", "link " + this.selector);

    // Remove old links
    link.exit().remove();

    // Update the paths
    link.attr("d", function(d){
      return self.elbow(d);
    });
  };

  /**
   * Helper function for drawing straight connecting lines
   * http://stackoverflow.com/a/10249720/879121
   */
  Tree.prototype.elbow = function(d) {
    var dir = this.direction,
        sourceX = d.source.x,
        sourceY = dir * (d.source.y + (boxWidth / 2)),
        targetX = d.target.x,
        targetY = dir * (d.target.y - (boxWidth / 2));

    return "M" + sourceY + "," + sourceX
      + "H" + (sourceY + (targetY-sourceY)/2)
      + "V" + targetX
      + "H" + targetY;
  }

  /**
   * Draw the person boxes.
   */
  Tree.prototype.drawNodes = function(nodes){

    var self = this;

    // Get a list of existing nodes
    var node = this.svg.selectAll("g.person." + this.selector)
        .data(nodes, function(person){
          return person.getId();
        });

    // Add new nodes
    var nodeEnter = node.enter()
        .append("g")
        .attr("class", "person " + this.selector);


    // Draw the person boxes
    nodeEnter.append('rect')
        .attr({
          width: boxWidth,
          height: boxHeight,
          x: -boxWidth / 2,
          y: -boxHeight / 2,
          rx: 5,
          ry: 5
		})
        .style("stroke", function(person,i){
			if (person.getGender() == 'Male') { return '#66c'; }
			if (person.getGender() == 'Female') { return '#c66'; }
			return '#6c6';
		})

    // Name text
    nodeEnter.append('text')
        .attr('class', 'name')
        .attr('clip-path', 'url(#name-clip)')
        .attr({
          dx: -(boxWidth/2) + 7,
          dy: -3
        })
        .text(function(person){
          //return person.getDisplayName();
          var t = person.getDisplayName();
		  //t += '(i='+person.getId()+',f='+person.getFatherId()+',m='+person.getMotherId()+',g='+person.getGender()+')';
		  //t += '(i='+person.getId()+',f='+person.getFatherId()+',m='+person.getMotherId()+',p='+person.getPrivacy()+')';
		  //t += '(i='+person.getId()+',g='+person.getGender()+')';
          return t;
        });

    // Lifespan
    nodeEnter.append('text')
        .attr('class', 'lifespan')
        .attr({
          dx: -(boxWidth/2) + 7,
          dy: 13
        })
        .text(function(person){
          return lifespan(person);
        });

    // Show info popup on click
    nodeEnter.on('click', function(person){
      d3.event.stopPropagation();
      self.personPopup(person, d3.mouse(self.svg.node()));
    });

    // Draw the plus icons
    var expandable = node.filter(function(person){
      return !person.getChildren() && (person.getFatherId() || person.getMotherId());
    });

    self.drawPlus(expandable.data());

    // Remove old nodes
    node.exit().remove();

    // Position
    node.attr("transform", function(d) { return "translate(" + (self.direction * d.y) + "," + d.x + ")"; });
  };

  /**
   * Add an plus icons (expand indicator)
   * We add icons to the svg element
   * so that it's not considered part of the person box.
   * This makes styling and events easier, sometimes
   * It means we have to keep it's position in sync
   * with the person's box.
   */
  Tree.prototype.drawPlus = function(persons){
    var self = this;

    var buttons = self.svg.selectAll('g.plus')
        .data(persons, function(person){
          return person.getId();
        });

    buttons.enter().append(drawPlus())
        .on('click', function(person){
          var plus = d3.select(this);
          var loader = self.svg.append('image')
              .attr({
                'xlink:href': '/images/icons/ajax-loader-snake-333-trans.gif',
                height: 16,
                width: 16,
                // transform: plus.attr('transform')
              })
              .attr("transform", function() {
                var y = self.direction * (person.y + (boxWidth / 2) + 12);
                return "translate(" + y + "," + (person.x - 8) + ")";
              });
          plus.remove();
          self._expand(person).then(function(){
            loader.remove();
          });
        });

    buttons.attr("transform", function(person) {
          var y = self.direction * (person.y + (boxWidth / 2) + 20);
          return "translate(" + y + "," + person.x + ")";
        });
  };

  /**
   * Show a popup for the person.
   */
  Tree.prototype.personPopup = function(person, event){
    this.removePopups();

    var photoUrl = person.getPhotoUrl(75),
        treeUrl = window.location.pathname + '?id=' + person.getName();

    // Use generic gender photos if there is not profile photo available
    if(!photoUrl){
      if(person.getGender() === 'Male'){
        photoUrl = '/images/icons/male.gif';
      } else {
        photoUrl = '/images/icons/female.gif';
      }
    }

    var popup = this.svg.append('g')
        .attr('class', 'popup')
        .attr('transform', 'translate('+event[0]+','+event[1]+')');

	// Gender-based stroke color on the pop-up box
	var strokeColor = '#6c6';
	if (person.getGender() === 'Male') { strokeColor='#66c'; }
	if (person.getGender() === 'Female') { strokeColor='#c66'; }

    // Draw the popup box
    var rect = popup.append('rect')
        .attr({
          width: 400,
          height: 200,
          rx: 10,
          ry: 10
        })
		.style('stroke', strokeColor);


    // Add the photo
    popup.append('image')
        .attr({
          x: 10,
          y: 10,
          width: 75,
          height: 75,
          'xlink:href': photoUrl
        });

    // Name
    popup.append('text')
        .attr('class', 'name')
        .attr({
          x: 93,
          y: 27
        })
        .text(person.getDisplayName());

    // Birth description
    var birthText = birthString(person),
        birthContainer = popup.append('text')
          .attr('class', 'birth vital')
          .attr({
            x: 93,
            y: 37
          });

    if(birthText){
      d3plus.textwrap()
          .width(275)
          .text(birthText)
          .container(birthContainer)
          .draw();
    }

    // Death description
    var birthBox = birthContainer.node().getBBox(),
        deathTop = birthBox.height + birthBox.y + 5,
        deathText = deathString(person),
        deathContainer = popup.append('text')
          .attr('class', 'death vital')
          .attr({
            x: 93,
            y: deathTop
          });

    if(deathText){
      d3plus.textwrap()
          .width(275)
          .text(deathText)
          .container(deathContainer)
          .draw();
    }

    // Tree and profile links
    var deathBox = deathContainer.node().getBBox(),
        linksTop = Math.max(110, deathBox.height + deathBox.y + 25);

    popup.append('text')
        .attr('class', 'popup-link')
        .attr({
          x: 100,
          y: linksTop,
          'text-anchor': 'middle'
        })
        .text( person.getName() ? 'Profile for '+person.getName() : '')
        .on('click', function(){
          window.open(person.getProfileUrl(), '_blank');
        });

    popup.append('text')
        .attr('class', 'popup-link')
        .attr({
          x: 200,
          y: linksTop,
          'text-anchor': 'middle'
        })
        .text(person.getName() ? 'Tree' : '')
        .on('click', function(){
          //window.location = window.location.pathname + '?id=' + person.getName()
          var a=person.getName().split('-',2);
          window.location = '/genealogy/'+a[0]+'-Family-Tree-'+a[1];
        });

    popup.append('text')
        .attr('class', 'popup-link')
        .attr({
          x: 300,
          y: linksTop,
          'text-anchor': 'middle'
        })
        .text(person.getName() ? 'Dynamic Tree' : '')
        .on('click', function(){
          //window.location = window.location.pathname + '?id=' + person.getName()
          window.location = '/treewidget/'+person.getName()+'/7';
        });



    // Resize the box to fit the content
    rect.attr({
      height: Math.max(130, linksTop + 20)
    });

    d3.select('#window').on('click', function(){
      popup.remove();
    });
  };

  /**
   * Remove all popups. It will also remove
   * any popups displayed by other trees on the
   * page which is what we want. If later we
   * decide we don't want that then we can just
   * add the selector class to each popup and
   * select on it, like we do with nodes and links.
   */
  Tree.prototype.removePopups = function(){
    d3.selectAll('.popup').remove();
  };

  /**
   * Render the embedded HTML that makes up
   * the person info boxes. We use HTML so
   * that we can easily clip the length of the
   * person's name
   */
  Tree.prototype.boxHTML = function(person){
    var name = person.getDisplayName();
    return '<div class="box">'
      + '<div class="name" title="' + name + '">' + name + '</div>'
      + '<div class="lifespan">' + lifespan(person) + '</div>'
      + '</div>';
  };

  /**
   * Manage the ancestors tree
   */
  var AncestorTree = function(svg){
    Tree.call(this, svg, 'ancestor', 1);
    this.children(function(person){
      var children = [],
          mother = person.getMother(),
          father = person.getFather();

/*
      if (person.getMotherId() == -1) {
         console.log("getMotherId = -1");
         mother = new wikitree.Person({});
         mother._data.Id = TreeViewer.nextPrivateId--;
         mother._data.BirthNamePrivate = '[private mother]';
         mother._data.Gender = 'Female';
      }
      if (person.getFatherId() == -1) {
         father = new wikitree.Person({});
         father._data.Id = TreeViewer.nextPrivateId--;
         father._data.BirthNamePrivate = '[private father]';
         father._data.Gender = 'Male';
      }
*/

      if(father){
        children.push(father);
      }
      if(mother){
        children.push(mother);
      }
      return children;
    });
  };

  // Inheritance
  AncestorTree.prototype = Object.create(Tree.prototype);

  /**
   * Manage the descendants tree
   */
  var DescendantTree = function(svg){
    Tree.call(this, svg, 'descendant', -1);

    this.children(function(person){
      // Convert children map to an array
      var children = person.getChildren(),
          list = [];
      for(var i in children){
        list.push(children[i]);
      }
      return list;
    });
  };

  // Inheritance
  DescendantTree.prototype = Object.create(Tree.prototype);

  /**
   * Create an unattached svg group representing the plus sign
   */
  function drawPlus(){
    return function(){
      var group = d3.select(document.createElementNS(d3.ns.prefix.svg, 'g'))
          .attr('class', 'plus');

      group.append('circle')
          .attr({
            cx: 0,
            cy: 0,
            r: 10
          });

      group.append('path')
          .attr('d', 'M0,5v-10M5,0h-10');

      return group.node();
    }
  };

  /**
   * Generate a string representing this person's lifespan
   */
  function lifespan(person){

    // This doesn't work well because some WikiTree dates aren't really valid Dates - they are "Fuzzy" with zeros for the day and possibly month.
    /*
    var birth = new Date(person.getBirthDate()),
        death = new Date(person.getDeathDate());
    var lifespan = '';
    if(birth && birth.getFullYear()){
      lifespan += birth.getFullYear();
    }
    if(death && death.getFullYear()){
      if(lifespan){
        lifespan += ' - ';
      }
      lifespan += death.getFullYear();
    }
    */

	var birth = '', death = '';
	if (person.getBirthDate()) { birth = person.getBirthDate().substr(0,4); }
    if (person.getDeathDate()) { death = person.getDeathDate().substr(0,4); }

    var lifespan = '';
    if (birth && birth != '0000') { lifespan += birth; }
    lifespan += ' - ';
    if (death && death != '0000') { lifespan += death; }

    return lifespan;
  };

  /**
   * Generate text that display when and where the person was born
   */
  function birthString(person){
    var string = '',
        date = humanDate(person.getBirthDate()),
        place = person.getBirthLocation();
    if(date){
      string = date;
    }
    if(place){
      string += ' in ' + place;
    }
    if(string){
      return 'Born ' + string + '.';
    }
  };

  /**
   * Generate text that display when and where the person died
   */
  function deathString(person){
    var string = '',
        date = humanDate(person.getDeathDate()),
        place = person.getDeathLocation();
    if(date){
      string = ' '+date;
    }
    if(place){
      string += ' in ' + place;
    }
    if(string){
      return 'Died' + string + '.';
    }
  };

  var monthNames = [
    "January", "February", "March",
    "April", "May", "June", "July",
    "August", "September", "October",
    "November", "December"
  ];

  /**
   * Turn a wikitree formatted date into a humanreadable date
   */
  function humanDate(dateString){
    if(dateString && /\d{4}-\d{2}-\d{2}/.test(dateString)){
      var parts = dateString.split('-'),
          year = parseInt(parts[0], 10),
          month = parseInt(parts[1], 10),
          day = parseInt(parts[2], 10);
      if(year){
        if(month){
          if(day){
            return monthNames[month-1] + ' ' + day + ', ' + year;
          } else {
            return monthNames[month-1] + ' ' + year;
          }
        } else {
          return year;
        }
      }
    } else {
      return dateString;
    }
  };

}());
