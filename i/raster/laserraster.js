/*

    AUTHOR:  Peter van der Walt
		Addional work by Nathaniel Stenzel

    LaserWeb Raster to GCODE Paperscript
    Copyright (C) 2015 Peter van der Walt

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

function figureIntensity(grey) {
	minIntensity = globals.minpwr2;
	maxIntensity = globals.maxpwr2;
	spotSize1 = globals.spotSize;
	intensity = (1 -grayLevel) * 100; //  Also add out Firmware specific mapping using intensity (which is 0-100) and map it between minIntensity and maxIntensity variables above * firmware specific multiplier (grbl 0-255, smoothie 0-1, etc)
	//Constraining Laser power between minIntensity and maxIntensity
	//console.log('Constraining');

	if (parseFloat(intensity) > 0) {
		intensity = intensity.map(0, 100, parseInt(minIntensity,10), parseInt(maxIntensity,10));
	} else {
		intensity = 0;
	};

	// Firmware Specific Gcode Output
	if (firmware.indexOf('Grbl') == 0) {
		intensity = intensity.map(0, 100, 0, 255);
		//console.log('Mapping Intensity range for Grbl S0-S255');
		intensity = intensity.toFixed(0);
	} else if (firmware.indexOf('Smooth') == 0) {
		intensity = intensity.map(0, 100, 0, 1);
		//console.log('Mapping Intensity range for Smoothieware S0-S1');
		intensity = intensity.toFixed(2);
	} else if (firmware.indexOf('Lasaur') == 0) {
		intensity = intensity.map(0, 100, 0, 255);
		//console.log('Mapping Intensity range for Smoothieware S0-S1');
		intensity = intensity.toFixed(0);
	} else {
		intensity = intensity.map(0, 100, 0, 100);
		//console.log('Mapping Intensity range for S0-S100');
		intensity = intensity.toFixed(0);
	}
	return intensity
}

function figureSpeed(passedGrey) {
	blackRate = globals.blackSpeed;
	whiteRate = globals.whiteSpeed;
	var calcspeed = passedGrey * 100;
	//console.log('Figure speed for brightness');

	calcspeed = calcspeed.map(0, 100, parseInt(blackRate,10), parseInt(whiteRate,10));
	calcspeed = calcspeed.toFixed(0);
	return calcspeed
}

// add MAP function to the Numbers function
Number.prototype.map = function (in_min, in_max, out_min, out_max) {
  return (this - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

this.RasterNow = function( _callback){
  console.time("Process Raster");
  var startTime = Date.now();

  // Initialise
	project.clear();
	var path = '';
	var raster = '';
  var lastgrey = '';
	var intensity = '';
	var gcodex = '';
	var gcodey = '';

  //Pull params from the Global context
  imgheight = globals.imgH;
  imgwidth = globals.imgW;
  feedRate = globals.feed;
  rapidRate = globals.rapid;
  blackRate = globals.blackSpeed;
  whiteRate = globals.whiteSpeed;
  useVariableSpeed = globals.variableSpeed;
	minIntensity = globals.minpwr2;
	maxIntensity = globals.maxpwr2;
	spotSize1 = globals.spotSize;

  // Create a raster item using the image tag 'origImage'
  raster = new Raster('origImage');
  raster.visible = false;
  var gridSize = 1;
  var spacing = 1;
	var speed = feedRate;
	// Log it as a sanity check
	console.log('Constraining Laser power between '+minIntensity+'% and '+maxIntensity+'%');
	console.log('Height: '+imgheight+'px, Width: '+imgwidth+'px');
	console.log('Spot Size: '+spotSize1+'mm');
	console.log('Raster Width: '+raster.width+' Height: '+raster.height);
	console.log('G0: '+rapidRate+' mm/min, G1: '+feedRate+' mm/min');
	if (useVariableSpeed) {
		console.log('Black speed: ' + blackRate + ' Whitespeed: ' + whiteRate);
	}


  // As the web is asynchronous, we need to wait for the raster to load before we can perform any operation on its pixels.
  raster.on('load', function() {

    var imgheight = globals.imgH;
    var imgwidth = globals.imgW;
    console.log('Width: '+imgwidth+'  Height: '+imgheight);

    // Init some variables we'll be using in the process
    s = ''; // Resultant gcode
    c = 0;  // Keep count of Gcode lines so we can optimise, lower = better
    xm = 0; // Keep count of Gcode lines so we can optimise, lower = better
    skip = 0;
    var dir = 1;
    var lastPosx = '0';
    var lastIntensity = '0';
    var megaPixel = 0;
    var todraw = 0;
		var lastGrey = -1; //the colors will be positive
		var x = 0;
		var endPosx = 0;
	  // GCODE Header
    s += '; GCODE generated by Laserweb \n';
    s += '; Firmware: '+firmware+'\n';
    s += '; Laser Min: '+minIntensity+'%\n';
    s += '; Laser Max: '+maxIntensity+'%\n';
	if (useVariableSpeed) {
		s += '; Black Speed: '+blackRate+'mm/min\n';
		s += '; White Speed: '+whiteRate+'mm/min\n';
	}
    s += '; Laser Spot Size '+spotSize1+'mm\n';
    s += '; Laser Feedrate '+feedRate+'mm/min\n\n';

    s += 'G21\nG90\nG1 F'+feedRate+'\nG0 F'+rapidRate+'\n';
		if (firmware.indexOf('Lasaur') == 0) {
			s += 'M80\n'; // Air Assist on
		};

    // Iterate through the Pixels

    for (var y = 0; y < raster.height; y++) {
		// Calculate where to move to to start the first and next rows - G0 Yxx move between lines
		posy = y;
		posy = (posy * spotSize1);
		posy = posy.toFixed(1);
		gcodey = (imgheight * spotSize1) - posy  // Offset Y since Gcode runs from bottom left and paper.js runs from top left
		gcodey = gcodey.toFixed(1);
		s += 'G0 Y'+gcodey+'\n';
		// Clear grayscale values on each line change
		lastGrey = -1;
		lastIntensity = -1;
		// Run the row:
		for(var px = 0; px <= raster.width ; px++) {
			if (dir > 0) { // Forward
				x = px;
				posx = x;
			} else { // Backward
				x = raster.width - px - 1;
				posx = x + 1;
			};
			// Convert Pixel Position to millimeter position
			posx = (posx * spotSize1);
			posx = posx.toFixed(1);
			// Keep some stats of how many pixels we've processed
			megaPixel++;
			// Determine the grayscale of the pixel(x,y)  we are looping over
			color = raster.getPixel(x, y);
			grayLevel = color.gray.toFixed(1);  // var grayLevel = color.gray.toFixed(2); // two decimal precision is plenty - for testing I will drop it to 1 decimal (10% increments)
			//
			if (lastGrey != grayLevel) {
				intensity = figureIntensity(grayLevel);
				speed = figureSpeed(lastGrey);
				lastGrey = grayLevel;
			};
			// Can't miss the first pixel (;
			if (px == 0) lastPosx = posx;
			// If we dont match the grayscale, we need to write some gcode...
			if (intensity != lastIntensity || px == raster.width) {
				c++;
				xm = 0;
				//console.log('From: '+lastPosx+', '+lastPosy+'  - To: '+posx+', '+posy+' at '+lastIntensity+'%');
				if (lastIntensity > 0) {
					if (useVariableSpeed) {
						s += 'G1 X'+posx+' Y'+gcodey+' S'+lastIntensity+' F'+speed+'\n';
					} else {
						s += 'G1 X'+posx+' Y'+gcodey+' S'+lastIntensity+' \n';
					}
					// This will hopefully get rid of black marks at the end of a line segment
					// It seems that some controllers dwell at a spot between gcode moves
					// If this does not work, switch to G1 to endPosx and then G0 to posx
					s += 'G1 S0\n';
				} else {
					s += 'G0 X'+posx+' Y'+gcodey+' S0\n';
				}

				// Debug:  Can be commented, but DON'T DELETE - I use it all the time when i find bug that I am not sure of
				// whether the root cause is the raster module or the gcode viewer module - by drawing the paper.js object I can
				// do a comparison to see which it is
				// Draw canvas (not used for GCODE generation)
				//path = new Path.Line({
				//		from: [(lastPosx * gridSize), (posy * gridSize)],
				//		to: [(endPosx * gridSize), (posy * gridSize)],
				//		strokeColor: 'black'
				//		});
				//path.strokeColor = 'black';
				//path.opacity = (lastIntensity / 100);
				// End of debug drawing
			} else {
				skip++
			};
			// End of write a line of gcode
			endPosx = posx;
			// Store values to use in next loop
			if (intensity != lastIntensity) {
				lastIntensity = intensity;
				lastPosx = posx
			};
		};
		dir = - dir; // Reverse direction for next row - makes us move in a more efficient zig zag down the image
	};
	if (firmware.indexOf('Lasaur') == 0) {
		s += 'M81\n'; // Air Assist off
	};

	// Populate the GCode textarea
  document.getElementById('gcodepreview').value = s;
  console.log('Optimsed by number of line: '+skip);

  // Some Post-job Stats and Cleanup
  console.log('Number of GCode Moves: '+c);
  var pixeltotal = raster.width * raster.height;
  console.log('Pixels: '+megaPixel+' done, of '+pixeltotal);

  console.timeEnd("Process Raster");
  var currentTime = Date.now();
  var elapsed = (currentTime - startTime);
  $('#console').append('<p class="pf" style="color: #009900;"><b>Raster completed in '+elapsed+' ms</b></p>');
  $('#console').scrollTop($("#console")[0].scrollHeight - $("#console").height());
  _callback();  // Done!
});
};
